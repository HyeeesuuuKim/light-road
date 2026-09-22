import { useEffect, useRef, useState } from 'react';
import { PiSpeakerHighBold, PiSpeakerSlashBold } from 'react-icons/pi';
import { GoAlert } from 'react-icons/go';
import { fetchRoute } from '../osrm';
import { speak, stopSpeak } from '../utils/tts';
import { startAlarm, stopAlarm } from '../utils/sos';
import { useNavigation } from '../hooks/useNavigation';
import { useCompass } from '../hooks/useCompass';
import NavigationBar from './NavigationBar';
import ArrivalCard from './ArrivalCard';

let _initDone = false;
function resetModuleFlag() { _initDone = false; }

function NavigationMap({ start, end, simMode = false, routeType = 'safe', routeData = null, cctvData = [], lightsData = [], policeData = [], bellData = [], onExit }) {

  const mapRef          = useRef(null);
  const mapObjRef       = useRef(null);
  const myMarkerRef     = useRef(null);
  const remainPolyRef   = useRef(null);
  const isMountedRef    = useRef(true);
  const watchIdRef      = useRef(null);
  const isSimulatingRef = useRef(false);
  const overlaysRef     = useRef([]);

  const routeRef     = useRef([]);
  const stepsRef     = useRef([]);
  const [routeLoaded,   setRouteLoaded]   = useState(false);
  const [arrowRotation, setArrowRotation] = useState(0);

  const { heading, requestPermission, removeListener } = useCompass();

  const nav = useNavigation({
    routeRef,
    stepsRef,
    start,
    onArrivalComplete: () => {
      if (isMountedRef.current) {
        setTimeout(() => stopNavigation(), 0);
      }
    },
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    let rotation = (nav.bearing - heading + 360) % 360;
    if (rotation > 180) rotation -= 360;
    setArrowRotation(rotation);
  }, [nav.bearing, heading]);

  const rebuildRoutePolyline = (naverCoords) => {
    if (remainPolyRef.current) {
      remainPolyRef.current.setMap(null);
      remainPolyRef.current = null;
    }
    if (!naverCoords || naverCoords.length === 0) return;
    remainPolyRef.current = new window.naver.maps.Polyline({
      path: naverCoords,
      strokeColor: '#0064FF',
      strokeWeight: 10,
      strokeOpacity: 0.9,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      zIndex: 10,
      map: mapObjRef.current,
    });
  };

  const clearOverlays = () => {
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
  };

  const drawRoute = (coordinates, useFitBounds = false) => {
    // 재호출(재시뮬레이션 등) 시 이전 오버레이가 누적되지 않도록 먼저 정리
    clearOverlays();

    const naverCoords = coordinates.map(
      ([lat, lng]) => new window.naver.maps.LatLng(lat, lng)
    );

    overlaysRef.current.push(new window.naver.maps.Marker({
      position: naverCoords[0],
      map: mapObjRef.current,
      icon: {
        content: `<div style="
          background:#16a34a;color:white;
          padding:4px 10px;border-radius:20px;
          font-size:12px;font-weight:bold;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
          white-space:nowrap;">출발</div>`,
        anchor: new window.naver.maps.Point(20, 14),
      },
    }));

    overlaysRef.current.push(new window.naver.maps.Marker({
      position: naverCoords[naverCoords.length - 1],
      map: mapObjRef.current,
      icon: {
        content: `<div style="
          background:#dc2626;color:white;
          padding:4px 10px;border-radius:20px;
          font-size:12px;font-weight:bold;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
          white-space:nowrap;">도착</div>`,
        anchor: new window.naver.maps.Point(20, 14),
      },
    }));

    // 시설물 마커 — 경로 안내 화면에서도 CCTV·가로등·경찰서·비상벨 표시
    cctvData.forEach(item => {
      overlaysRef.current.push(new window.naver.maps.Circle({
        center: new window.naver.maps.LatLng(item.lat, item.lng),
        radius: 8, fillColor: '#56CCF2', fillOpacity: 0.7,
        strokeWeight: 0, map: mapObjRef.current,
      }));
    });
    lightsData.forEach(item => {
      overlaysRef.current.push(new window.naver.maps.Circle({
        center: new window.naver.maps.LatLng(item.lat, item.lng),
        radius: 8, fillColor: '#FAC775', fillOpacity: 0.7,
        strokeWeight: 0, map: mapObjRef.current,
      }));
    });
    policeData.forEach(item => {
      overlaysRef.current.push(new window.naver.maps.Circle({
        center: new window.naver.maps.LatLng(item.lat, item.lng),
        radius: 16, fillColor: '#4A90E2', fillOpacity: 0.8,
        strokeWeight: 0, map: mapObjRef.current,
      }));
    });
    bellData.forEach(item => {
      overlaysRef.current.push(new window.naver.maps.Circle({
        center: new window.naver.maps.LatLng(item.lat, item.lng),
        radius: 14, fillColor: '#E24B4A', fillOpacity: 0.8,
        strokeWeight: 0, map: mapObjRef.current,
      }));
    });

    rebuildRoutePolyline(naverCoords);

    if (useFitBounds) {
      const bounds = new window.naver.maps.LatLngBounds();
      naverCoords.forEach((coord) => bounds.extend(coord));
      mapObjRef.current.fitBounds(bounds, { top: 80, right: 40, bottom: 160, left: 40 });
    }
  };

  useEffect(() => {
    if (!start || !end) return;
    if (_initDone) return;
    _initDone = true;

    isMountedRef.current    = true;
    isSimulatingRef.current = false;

    const initMap = () => {
      if (!window.naver || !window.naver.maps) {
        setTimeout(initMap, 100);
        return;
      }
      if (!mapRef.current) {
        setTimeout(initMap, 50);
        return;
      }

      console.time('[nav-1] 지도 객체 생성');
      mapObjRef.current = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(start[0], start[1]),
        zoom: 14,
      });
      console.timeEnd('[nav-1] 지도 객체 생성');

      console.time('[nav-2] fetchRoute (routeData 재사용 여부 확인)');
      fetchRoute(start[0], start[1], end[0], end[1], routeType, routeData)
        .then(({ coordinates, steps }) => {
          console.timeEnd('[nav-2] fetchRoute (routeData 재사용 여부 확인)');
          if (!isMountedRef.current) return;
          routeRef.current = coordinates;
          stepsRef.current = steps;
          setRouteLoaded(true);

          if (simMode) {
            stopSpeak();
            console.time('[nav-3] drawRoute (마커 ' + (cctvData.length + lightsData.length + policeData.length + bellData.length) + '개 생성)');
            drawRoute(coordinates, false);
            console.timeEnd('[nav-3] drawRoute (마커 ' + (cctvData.length + lightsData.length + policeData.length + bellData.length) + '개 생성)');
            isSimulatingRef.current = true;
            // zoom=19 먼저 설정 — 멘트 재생 중에도 확대 상태 유지
            if (mapObjRef.current) {
              mapObjRef.current.setOptions({
                center: new window.naver.maps.LatLng(coordinates[0][0], coordinates[0][1]),
                zoom: 19,
              });
            }
            // startSimulation 먼저 실행 → onRoute 전환 후 시작 멘트 발화
            console.time('[nav-4] startSimulation → speak 호출까지');
            nav.startSimulation(
              mapObjRef.current,
              myMarkerRef,
              rebuildRoutePolyline,
            );
          } else {
            stopSpeak();
            drawRoute(coordinates, false);
            requestPermission();

            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (!isMountedRef.current) return;
                const { latitude, longitude } = position.coords;
                const currentPos = new window.naver.maps.LatLng(latitude, longitude);

                mapObjRef.current.setOptions({
                  center: currentPos,
                  zoom: 19,
                });

                myMarkerRef.current = new window.naver.maps.Marker({
                  position: currentPos,
                  map: mapObjRef.current,
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

                nav.startNavigation(rebuildRoutePolyline);
                speak('경로 안내를 시작합니다.', false, () => {
                  nav.startStopPolling();
                });

                setTimeout(() => {
                  if (!isMountedRef.current) return;
                  nav.updateToStart(
                    latitude, longitude,
                    mapObjRef.current, myMarkerRef,
                  );
                }, 50);
              },
              (error) => {
                console.error('현 위치 획득 실패:', error.message);
              },
              { enableHighAccuracy: true, timeout: 10000 }
            );
          }
        })
        .catch((err) => console.error('경로 로드 실패:', err));

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          if (isSimulatingRef.current) return;
          if (!isMountedRef.current)   return;

          const { latitude, longitude } = position.coords;

          if (nav.modeRef.current === 'toStart') {
            nav.updateToStart(
              latitude, longitude,
              mapObjRef.current, myMarkerRef,
            );
            return;
          }

          if (nav.modeRef.current === 'onRoute') {
            nav.updatePosition(
              latitude, longitude, false,
              mapObjRef.current, myMarkerRef,
            );
          }
        },
        (error) => {
          if (error.code !== error.TIMEOUT) {
            console.error('위치 오류:', error.message);
          }
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    };

    initMap();

    return () => {
      isMountedRef.current    = false;
      isSimulatingRef.current = false;

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      clearInterval(nav.simIntervalRef.current);
      clearInterval(nav.countdownRef.current);
      nav.simIntervalRef.current = null;
      nav.countdownRef.current   = null;

      // 언마운트 시 이전 실행의 마커/원이 남아있지 않도록 완전 정리
      clearOverlays();
      if (myMarkerRef.current) {
        myMarkerRef.current.setMap(null);
        myMarkerRef.current = null;
      }

      // 컴포넌트 언마운트 시 정지 감지 완전 종료 (폴링 포함)
      nav.stopAllStopDetection();

      removeListener();
    };
  }, [start, end]);

  const stopNavigation = () => {
    resetModuleFlag();
    isSimulatingRef.current = false;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    clearInterval(nav.simIntervalRef.current);
    clearInterval(nav.countdownRef.current);
    nav.simIntervalRef.current = null;
    nav.countdownRef.current   = null;

    if (myMarkerRef.current) {
      myMarkerRef.current.setMap(null);
      myMarkerRef.current = null;
    }

    clearOverlays();

    if (mapObjRef.current) {
      mapObjRef.current.setOptions({ heading: 0 });
      const naverCoords = routeRef.current.map(
        ([lat, lng]) => new window.naver.maps.LatLng(lat, lng)
      );
      rebuildRoutePolyline(naverCoords);
      const bounds = new window.naver.maps.LatLngBounds();
      naverCoords.forEach((coord) => bounds.extend(coord));
      mapObjRef.current.fitBounds(bounds, { top: 80, right: 40, bottom: 160, left: 40 });
    }

    stopSpeak();
    stopAlarm();
    nav.stopAllStopDetection();
    onExit();
  };

  if (!start || !end) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100vw', height: '100vh',
        fontSize: '16px', color: '#6b7280',
      }}>
        출발지와 목적지를 입력해주세요.
      </div>
    );
  }

  const isNavigating = nav.mode === 'toStart' || nav.mode === 'onRoute';

  return (
    <>
      <div ref={mapRef} style={{ width: '100vw', height: '100vh' }} />

      {isNavigating && (
        <NavigationBar
          mode={nav.mode}
          arrowRotation={arrowRotation}
          instruction={
            nav.mode === 'toStart'
              ? '출발지로 이동 중'
              : nav.instruction
          }
          distToStep={
            nav.mode === 'toStart'
              ? nav.distToStart
              : nav.distToStep
          }
          isOffRoute={nav.mode === 'onRoute' ? nav.isOffRoute : false}
          onStop={stopNavigation}
        />
      )}

      {nav.mode === 'arrived' && (
        <ArrivalCard
          countdown={nav.countdown}
          onStop={stopNavigation}
        />
      )}

      {/* ── 이상 정지 감지 팝업 ── */}
      {nav.stopPopup && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            background: '#1a2635',
            border: `2px solid ${nav.stopPopup === 3 ? '#dc2626' : '#56CCF2'}`,
            borderRadius: '16px',
            padding: '28px 24px',
            width: '80%', maxWidth: '320px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>
              {nav.stopPopup === 3 ? '🚨' : '🔔'}
            </div>
            <div style={{
              fontSize: '18px', fontWeight: 'bold',
              color: nav.stopPopup === 3 ? '#dc2626' : '#56CCF2',
              marginBottom: '8px',
            }}>
              {nav.stopPopup === 1 ? '괜찮으신가요?' :
               nav.stopPopup === 2 ? '문제가 있나요?' :
               '위험하신가요?'}
            </div>
            <div style={{ fontSize: '13px', color: '#8aabb8', marginBottom: '20px' }}>
              {nav.stopPopup < 3
                ? '이동이 멈춘 것 같아 확인합니다.'
                : <><br />장시간 이동이 없습니다.<br />위험한 상황이라면 경보를 울리세요.</> }
            </div>

            {/* 3차 팝업 — SOS 경보 버튼 */}
            {nav.stopPopup === 3 && (
              <button
                onClick={() => {
                  if (nav.alarmOn) {
                    stopAlarm();
                    nav.setAlarmOn(false);
                  } else {
                    startAlarm();
                    nav.setAlarmOn(true);
                  }
                }}
                onMouseDown={(e) => e.currentTarget.style.setProperty('transform', 'scale(0.97)', 'important')}
                onMouseUp={(e) => e.currentTarget.style.setProperty('transform', 'scale(1)', 'important')}
                onMouseLeave={(e) => e.currentTarget.style.setProperty('transform', 'scale(1)', 'important')}
                style={{
                  width: '100%', padding: '14px',
                  background: nav.alarmOn ? '#7f1d1d' : '#dc2626',
                  color: 'white', border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px', fontWeight: 'bold',
                  cursor: 'pointer', marginBottom: '10px',
                  transition: 'transform 0.1s',
                }}>
                {nav.alarmOn ? <><PiSpeakerSlashBold size={18} style={{marginRight:'6px'}}/> 경보 중단</> : <><PiSpeakerHighBold size={18} style={{marginRight:'6px'}}/> SOS 경보 울리기</>}
              </button>
            )}

            <button
              onClick={() => {
                stopAlarm();
                nav.setAlarmOn(false);
                nav.resetStopDetection();
              }}
              onMouseEnter={(e) => e.currentTarget.style.setProperty('background', '#32b8e0', 'important')}
              onMouseLeave={(e) => { e.currentTarget.style.setProperty('background', '#56CCF2', 'important'); e.currentTarget.style.setProperty('transform', 'scale(1)', 'important'); }}
              onMouseDown={(e) => { e.currentTarget.style.setProperty('background', '#28a8ce', 'important'); e.currentTarget.style.setProperty('transform', 'scale(0.97)', 'important'); }}
              onMouseUp={(e) => { e.currentTarget.style.setProperty('background', '#32b8e0', 'important'); e.currentTarget.style.setProperty('transform', 'scale(1)', 'important'); }}
              style={{
                width: '100%', padding: '14px',
                background: '#56CCF2',
                color: '#0f1923', border: 'none',
                borderRadius: '10px',
                fontSize: '15px', fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background 0.15s, transform 0.1s',
              }}>
              괜찮아요
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default NavigationMap;