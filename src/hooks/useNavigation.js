import { useState, useRef, useCallback } from 'react';
import { speak } from '../utils/tts';
import { playChime } from '../utils/sos';
import { calcDistance, calcBearing } from '../utils/geoUtils';
import { getInstruction, getAction } from '../utils/formatUtils';

const ARRIVE_RADIUS       = 20;

// ── 이상 정지 감지 상수 ───────────────────────────────────────────────────
const STOP_SPEED_THRESHOLD = 0.3;             // m/s 이하면 정지로 판단
const STOP_DURATION_1      = 3 * 60 * 1000;   // 1차 팝업: 3분 | 테스트를 위해 5초(5 * 1000;)로 축소
const STOP_DURATION_2      = 2 * 60 * 1000;   // 2차 팝업 대기: 2분 | 테스트를 위해 5초(5 * 1000;)로 축소
const POPUP_TIMEOUT        = 1 * 60 * 1000;   // 팝업 무응답 타임아웃: 1분 | 테스트를 위해 5초(5 * 1000;)로 축소
const OFF_ROUTE_THRESHOLD = 30;
const STEP_ANNOUNCE_FAR   = 50;
const STEP_ANNOUNCE_NEAR  = 15;
const TO_START_THRESHOLD  = 30;

// ── 스텝별 경로 좌표 인덱스 사전 계산 ────────────────────────────────────────
function computeStepCoordIndices(coords, steps) {
  const result = new Array(steps.length).fill(coords.length - 1);
  let searchStart = 0;
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    let bestIdx  = searchStart;
    let bestDist = Infinity;
    for (let i = searchStart; i < coords.length; i++) {
      const d = calcDistance(step.lat, step.lng, coords[i][0], coords[i][1]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    result[s] = bestIdx;
    searchStart = bestIdx; // 스텝은 경로 순서대로 나오므로 역행 탐색 방지
  }
  return result;
}

export function useNavigation({ routeRef, stepsRef, start, onArrivalComplete }) {

  const [mode,        setMode]        = useState('preview');
  const [instruction, setInstruction] = useState('');
  const [distToStep,  setDistToStep]  = useState(null);
  const [distToStart, setDistToStart] = useState(null);
  const [isOffRoute,  setIsOffRoute]  = useState(false);
  const [bearing,     setBearing]     = useState(0);
  const [countdown,   setCountdown]   = useState(10);

  // ── 이상 정지 감지 state ──────────────────────────────────────────────────
  const [stopPopup,    setStopPopup]    = useState(null); // null | 1 | 2 | 3
  const [alarmOn,      setAlarmOn]      = useState(false);

  const modeRef           = useRef('preview');
  const currentIdxRef     = useRef(0);
  const currentStepIdxRef = useRef(0);
  const stepFiredRef      = useRef(-1);
  const stepCoordIdxRef   = useRef([]);  // 스텝별 경로 좌표 인덱스 (사전 계산)
  const simIntervalRef    = useRef(null);
  const countdownRef      = useRef(null);
  const rebuildPolyFnRef      = useRef(null);

  // ── 이상 정지 감지 ref ────────────────────────────────────────────────────
  const lastPosRef            = useRef(null);   // 마지막 위치 { lat, lng, time }
  const popupStageRef         = useRef(0);      // 현재 팝업 단계 (0: 없음, 1, 2, 3)
  const stopCheckIntervalRef  = useRef(null);   // 정지 감지 폴링 인터벌
  const stopDetectionActiveRef = useRef(false); // 경로 안내 모드 활성 여부 (정지 감지 guard)

  const setModeSync = useCallback((newMode) => {
    modeRef.current = newMode;
    setMode(newMode);
  }, []);

  // ── 이상 정지 감지 ───────────────────────────────────────────────────────────
  // setTimeout 없이 단일 인터벌로 모든 단계 전환 처리
  // popupStageRef, popupTimerStartRef를 통해 단계별 타이밍 관리

  const stopAllStopDetection = useCallback(() => {
    stopDetectionActiveRef.current = false;
    clearInterval(stopCheckIntervalRef.current);
    stopCheckIntervalRef.current = null;
    popupStageRef.current = 0;
    lastPosRef.current = null;
    setStopPopup(null);
  }, []);

  const resetStopDetection = useCallback(() => {
    popupStageRef.current = 0;
    lastPosRef.current = { lat: null, lng: null, time: Date.now() };
    setStopPopup(null);
  }, []);

  const checkStopDetection = useCallback((lat, lng) => {
    if (!stopDetectionActiveRef.current) return;
    const now = Date.now();
    const prev = lastPosRef.current;

    if (prev && prev.lat !== null) {
      const distM = calcDistance(lat, lng, prev.lat, prev.lng);
      const elapsed = (now - prev.time) / 1000;
      const estimatedSpeed = elapsed > 0 ? distM / elapsed : 0;

      if (estimatedSpeed >= STOP_SPEED_THRESHOLD) {
        if (popupStageRef.current > 0) {
          popupStageRef.current = 0;
          setStopPopup(null);
        }
        lastPosRef.current = { lat, lng, time: now };
        return;
      }
    }

    if (popupStageRef.current === 0) {
      lastPosRef.current = { lat, lng, time: lastPosRef.current?.time ?? now };
    }
  }, []);

  // 단일 인터벌로 정지 감지 + 단계 전환 전부 처리
  // setTimeout 없이 인터벌 내에서 직접 ref를 읽어 판단 — 클로저 문제 없음
  const startStopPolling = useCallback(() => {
    if (stopCheckIntervalRef.current) return;
    lastPosRef.current = { lat: null, lng: null, time: Date.now() };
    // popupStageStartTime: 현재 단계 팝업이 시작된 시각
    // popupWaitStartTime: 팝업 닫힌 후 다음 단계 대기 시작 시각
    let popupStageStartTime = null;  // 팝업 표시 시작 시각
    let popupWaitStartTime  = null;  // 다음 단계 대기 시작 시각
    let lastShownStage      = 0;     // 마지막으로 표시한 팝업 단계 추적

    stopCheckIntervalRef.current = setInterval(() => {
      // guard: 경로 안내 모드 아니면 즉시 중단
      if (!stopDetectionActiveRef.current) {
        clearInterval(stopCheckIntervalRef.current);
        stopCheckIntervalRef.current = null;
        return;
      }

      const now = Date.now();
      const stage = popupStageRef.current;

      if (stage === 0 && popupWaitStartTime === null) {
        // 정지 감지 대기 중
        const last = lastPosRef.current;
        if (!last || !last.time) return;
        if (now - last.time >= STOP_DURATION_1) {
          lastPosRef.current = { ...last, time: now };
          lastShownStage = 1;
          popupStageRef.current = 1;
          popupStageStartTime = now;
          setStopPopup(1);
          playChime(1);
        }

      } else if (stage > 0 && stage < 3) {
        // 팝업 표시 중 — 무응답 타임아웃 체크
        if (popupStageStartTime && now - popupStageStartTime >= POPUP_TIMEOUT) {
          // 무응답 → 팝업 닫고 다음 단계 대기
          popupStageRef.current = 0;
          popupStageStartTime = null;
          popupWaitStartTime = now;
          setStopPopup(null);
        }

      } else if (stage === 0 && popupWaitStartTime !== null) {
        // 다음 단계 대기 중
        if (now - popupWaitStartTime >= STOP_DURATION_2) {
          const nextStage = Math.min(lastShownStage + 1, 3); // lastShownStage로 정확히 추적
          popupWaitStartTime = null;
          lastShownStage = nextStage;
          popupStageRef.current = nextStage;
          popupStageStartTime = (nextStage < 3) ? now : null; // 3차는 타임아웃 없음
          setStopPopup(nextStage);
          playChime(nextStage);
        }
      }
      // 3차 팝업: stage === 3이면 아무것도 안 함 — 사용자가 직접 닫을 때까지 유지
    }, 5000);
  }, []);

  // ── 도착 처리 ─────────────────────────────────────────────────────────────
  const handleArrival = useCallback(() => {
    if (modeRef.current === 'arrived') return;
    if (countdownRef.current) return;

    setModeSync('arrived');
    setInstruction('');
    setDistToStep(null);
    setIsOffRoute(false);
    clearInterval(simIntervalRef.current);
    simIntervalRef.current = null;
    speak('목적지에 도착하였습니다. 경로 안내를 종료합니다.');

    setCountdown(10);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          if (onArrivalComplete) onArrivalComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [setModeSync, onArrivalComplete]);

  // ── toStart 단계: GPS 위치 업데이트 ──────────────────────────────────────
  const updateToStart = useCallback((lat, lng, mapObj, myMarker) => {
    if (!start) return;

    const currentPos = new window.naver.maps.LatLng(lat, lng);

    if (!myMarker.current) {
      myMarker.current = new window.naver.maps.Marker({
        position: currentPos,
        map: mapObj,
        icon: {
          content: `<div style="
            width:18px;height:18px;
            background:#2563eb;border-radius:50%;
            border:3px solid white;
            box-shadow:0 0 8px rgba(37,99,235,0.6);
          "></div>`,
          anchor: new window.naver.maps.Point(9, 9),
        },
        zIndex: 200,
      });
    } else {
      myMarker.current.setPosition(currentPos);
    }

    if (mapObj) mapObj.setCenter(currentPos);

    const d = calcDistance(lat, lng, start[0], start[1]);
    setDistToStart(Math.round(d));

    const bearingToStart = Math.round(calcBearing(lat, lng, start[0], start[1]));
    setBearing(bearingToStart);
    if (mapObj) mapObj.setOptions({ heading: bearingToStart });

    if (d <= TO_START_THRESHOLD) {
      setDistToStart(null);
      setModeSync('onRoute');
      if (mapObj) mapObj.setOptions({ zoom: 19 });
    }

    // 출발지 이동 중에도 정지 감지 활성
    checkStopDetection(lat, lng);
  }, [start, setModeSync, checkStopDetection]);

  // ── onRoute 위치 업데이트 ─────────────────────────────────────────────────
  const updatePosition = useCallback((lat, lng, isSimulation = false, mapObj, myMarker) => {
    const coords = routeRef.current;
    const steps  = stepsRef.current;
    if (coords.length === 0) return;

    // 스텝별 경로 좌표 인덱스 최초 1회 계산 (경로가 바뀌면 길이가 달라지므로 재계산)
    if (stepCoordIdxRef.current.length !== steps.length) {
      stepCoordIdxRef.current = computeStepCoordIndices(coords, steps);
    }

    const currentPos = new window.naver.maps.LatLng(lat, lng);

    if (!myMarker.current) {
      myMarker.current = new window.naver.maps.Marker({
        position: currentPos,
        map: mapObj,
        icon: {
          content: `<div style="
            width:18px;height:18px;
            background:#2563eb;border-radius:50%;
            border:3px solid white;
            box-shadow:0 0 8px rgba(37,99,235,0.6);
          "></div>`,
          anchor: new window.naver.maps.Point(9, 9),
        },
        zIndex: 200,
      });
    } else {
      myMarker.current.setPosition(currentPos);
    }

    if (mapObj) mapObj.setCenter(currentPos);

    // 도착 감지 (GPS 전용)
    if (!isSimulation) {
      const lastCoord = coords[coords.length - 1];
      const distToEnd = calcDistance(lat, lng, lastCoord[0], lastCoord[1]);
      if (distToEnd <= ARRIVE_RADIUS) {
        handleArrival();
        return;
      }
    }

    // 가장 가까운 경로 좌표 탐색
    let closestIdx  = currentIdxRef.current;
    let closestDist = Infinity;
    for (let i = currentIdxRef.current; i < coords.length; i++) {
      const d = calcDistance(lat, lng, coords[i][0], coords[i][1]);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }
    currentIdxRef.current = closestIdx;

    if (isSimulation) {
      setIsOffRoute(false);
    } else {
      setIsOffRoute(closestDist > OFF_ROUTE_THRESHOLD);
    }

    // 남은 경로 폴리라인 갱신
    if (rebuildPolyFnRef.current) {
      const naverCoords = coords
        .slice(closestIdx)
        .map(([la, ln]) => new window.naver.maps.LatLng(la, ln));
      rebuildPolyFnRef.current(naverCoords);
    }

    // 방위각 계산
    const nextCoord  = coords[Math.min(closestIdx + 1, coords.length - 1)];
    const newBearing = Math.round(calcBearing(lat, lng, nextCoord[0], nextCoord[1]));
    setBearing(newBearing);
    if (mapObj) mapObj.setOptions({ heading: newBearing });

    // ── 이상 정지 감지 (GPS 전용, 시뮬레이션 중에는 비활성) ────────────────
    if (!isSimulation) {
      checkStopDetection(lat, lng);
    }

    // ── OSRM step 기반 안내 ──────────────────────────────────────────────
    let stepIdx = currentStepIdxRef.current;
    while (
      stepIdx < steps.length &&
      (steps[stepIdx].instruction === 'depart' || steps[stepIdx].instruction === 'arrive')
    ) {
      stepIdx += 1;
      currentStepIdxRef.current = stepIdx;
    }

    if (stepIdx < steps.length) {
      const nextStep = steps[stepIdx];
      const stepDist = calcDistance(lat, lng, nextStep.lat, nextStep.lng);
      setDistToStep(Math.round(stepDist));

      const stepCoordIdx   = stepCoordIdxRef.current[stepIdx] ?? Infinity;
      const alreadyPassed  = closestIdx >= stepCoordIdx;

      if (stepDist <= STEP_ANNOUNCE_NEAR || alreadyPassed) {
        if (stepFiredRef.current !== stepIdx) {
          stepFiredRef.current      = stepIdx;
          const instrText = getInstruction(nextStep);
          setInstruction(instrText);
          speak(instrText);
          currentStepIdxRef.current = stepIdx + 1;

          const nextStepIdx = stepIdx + 1;
          if (nextStepIdx < steps.length) {
            const afterStep = steps[nextStepIdx];
            const afterDist = calcDistance(lat, lng, afterStep.lat, afterStep.lng);
            const action    = getAction(afterStep);
            setTimeout(() => {
              setInstruction(
                afterDist <= STEP_ANNOUNCE_FAR
                  ? `${Math.round(afterDist)}m 앞 ${action}`
                  : '직진하세요'
              );
            }, 1500);
          }
        }
      } else if (stepDist <= STEP_ANNOUNCE_FAR) {
        const previewText = `${Math.round(stepDist)}m 앞 ${getAction(nextStep)}`;
        setInstruction(previewText);
        // 예고 멘트 — 아직 발화 안 한 경우에만 (stepFiredRef 활용)
        if (stepFiredRef.current !== stepIdx * 10) {
          stepFiredRef.current = stepIdx * 10;
          speak(`잠시 후 ${getAction(nextStep)}입니다`);
        }
      }
    }
  }, [routeRef, stepsRef, handleArrival, checkStopDetection]);

  // ── 내비게이션 리셋 ───────────────────────────────────────────────────────
  const resetNavigation = useCallback(() => {
    clearInterval(simIntervalRef.current);
    clearInterval(countdownRef.current);
    clearInterval(stopCheckIntervalRef.current);
    simIntervalRef.current       = null;
    countdownRef.current         = null;
    stopCheckIntervalRef.current = null;

    currentIdxRef.current     = 0;
    currentStepIdxRef.current = 0;
    stepFiredRef.current      = -1;
    stepCoordIdxRef.current    = [];

    setModeSync('preview');
    setDistToStep(null);
    setDistToStart(null);
    setInstruction('');
    setCountdown(10);
    setIsOffRoute(false);
    setBearing(0);
  }, [setModeSync]);

  // ── 시뮬레이션 시작 ──────────────────────────────────────────────────────
  const startSimulation = useCallback((mapObj, myMarker, rebuildPolyFn) => {
    rebuildPolyFnRef.current = rebuildPolyFn;

    // 시뮬레이션 중에는 정지 감지 완전 비활성
    stopDetectionActiveRef.current = false;
    clearInterval(stopCheckIntervalRef.current);
    stopCheckIntervalRef.current = null;
    popupStageRef.current        = 0;
    lastPosRef.current           = null;
    setStopPopup(null);

    currentIdxRef.current     = 0;
    currentStepIdxRef.current = 0;
    stepFiredRef.current      = -1;
    stepCoordIdxRef.current    = [];
    setInstruction('');
    setIsOffRoute(false);
    setDistToStart(null);

    if (mapObj) {
      mapObj.setOptions({
        center: new window.naver.maps.LatLng(start[0], start[1]),
        zoom: 19,
      });
    }

    setTimeout(() => {
      setModeSync('onRoute');

      // 음성 엔진 워밍업 후 시작 멘트 발화 — 앞부분 잘림 방지
      setTimeout(() => {
        console.timeEnd('[nav-4] startSimulation → speak 호출까지');
        speak('경로 안내를 시작합니다.', false, () => {
        const coords = routeRef.current;
        let idx = 0;
        simIntervalRef.current = setInterval(() => {
          if (idx >= coords.length) {
            clearInterval(simIntervalRef.current);
            simIntervalRef.current = null;
            handleArrival();
            return;
          }
          updatePosition(coords[idx][0], coords[idx][1], true, mapObj, myMarker);
          idx += 1;
          }, 1500);
        });
      }, 400);
    }, 0);

  }, [start, routeRef, handleArrival, updatePosition, setModeSync]);

  const startNavigation = useCallback((rebuildPolyFn) => {
    rebuildPolyFnRef.current  = rebuildPolyFn;
    currentIdxRef.current     = 0;
    currentStepIdxRef.current = 0;
    stepFiredRef.current      = -1;
    stepCoordIdxRef.current    = [];
    setInstruction('');
    setIsOffRoute(false);
    setDistToStart(null);
    stopDetectionActiveRef.current = true; // 경로 안내 모드 진입 플래그만 세팅

    setTimeout(() => {
      setModeSync('toStart');
    }, 0);
  }, [setModeSync]);

  return {
    mode, modeRef, setModeSync,
    instruction, distToStep, distToStart, isOffRoute, bearing, countdown,
    setDistToStart, setIsOffRoute,
    handleArrival, updatePosition, updateToStart, startNavigation,
    resetNavigation, startSimulation,
    simIntervalRef, countdownRef,
    rebuildPolyFnRef,
    TO_START_THRESHOLD,
    // 이상 정지 감지
    stopPopup, alarmOn, setAlarmOn, resetStopDetection, stopAllStopDetection,
    startStopPolling,
  };
}