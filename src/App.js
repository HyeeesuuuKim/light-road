import { useState, useRef } from 'react';
import './App.css';
import { FiNavigation, FiPlay } from 'react-icons/fi';
import { FaShieldAlt } from 'react-icons/fa';
import { MdVideocam, MdLightbulb } from 'react-icons/md';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import RouteCard from './components/RouteCard';
import AiGuide from './components/AiGuide';
import MapView from './components/MapView';
import NavigationMap from './components/NavigationMap';
import { getAiMessage } from './utils/gemini';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL
  || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://127.0.0.1:8000'
      : 'http://127.0.0.1:8000');

function App() {
  // setLoading은 비동기라 클릭 시점에 따라 중복 실행을 완전히 막지 못할 수 있음.
  // ref는 즉시 반영되므로 handleSearch 재진입 방지용으로 별도 사용.
  const isSearchingRef = useRef(false);
  // 안심/최단 카드 빠른 연속 클릭 시, 또는 검색 직후 백그라운드 AI와
  // 경로 전환 AI가 겹치는 경우 fetchAiMessage 중복 호출 방지용
  const isAiBusyRef = useRef(false);

  const [origin, setOrigin] = useState('');
  const [dest,   setDest]   = useState('');
  const [originCoord, setOriginCoord] = useState(null);
  const [destCoord,   setDestCoord]   = useState(null);

  const [searched,      setSearched]      = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [selectedRoute, setSelectedRoute] = useState('safe');

  const [safeRoute,  setSafeRoute]  = useState(null);
  const [shortRoute, setShortRoute] = useState(null);

  // ── 경로별 마커 캐시 (전환 시 /markers 재호출 방지) ──────────────────────
  const [safeMarkerCache,  setSafeMarkerCache]  = useState(null);
  const [shortMarkerCache, setShortMarkerCache] = useState(null);

  const [cctvData,   setCctvData]   = useState([]);
  const [lightsData, setLightsData] = useState([]);
  const [policeData, setPoliceData] = useState([]);
  const [bellData,   setBellData]   = useState([]);

  // ── Header용 시설물 수 (안심+최단 합산 중복 제거) ────────────────────────
  const [allCctvCount,   setAllCctvCount]   = useState(0);
  const [allLightsCount, setAllLightsCount] = useState(0);

  const [originPos, setOriginPos] = useState(null);
  const [destPos,   setDestPos]   = useState(null);

  const [aiMessage, setAiMessage] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ── 내비게이션 state ──────────────────────────────────────────────────────
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSimMode,    setIsSimMode]    = useState(false);

  // ── 긴급 대피 (현재 위치 → 가까운 안전시설) ──────────────────────────────
  const [emergency,        setEmergency]        = useState(null); // null | { police, cctv, currentPos }
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyNav,     setEmergencyNav]     = useState(false);

  // ── AI 메시지 생성 ────────────────────────────────────────────────────────
  async function fetchAiMessage(routeType, targetRoute, safe, short) {
    setAiLoading(true);
    setAiMessage('');
    const msg = await getAiMessage({
      routeType,
      safeScore : safe.score,
      shortScore: short.score,
      lights    : targetRoute.lights,
      cctvs     : targetRoute.cctv,
      distance  : targetRoute.distance,
      duration  : targetRoute.duration,
    });
    setAiMessage(msg);
    setAiLoading(false);
  }

  // ── 좌표 확보 (드롭다운 선택 시 /geocode 재호출 생략) ───────────────────
  async function resolveCoord(text, coord) {
    if (coord) return coord;
    const res  = await fetch(`${BACKEND_URL}/geocode?address=${encodeURIComponent(text)}`);
    const data = await res.json();
    if (data.error) throw new Error('geocode 실패');
    return { lat: data.lat, lng: data.lng };
  }

  // ── 출발지 ↔ 목적지 교환 ─────────────────────────────────────────────────
  function handleSwap() {
    const tmpText  = origin;
    const tmpCoord = originCoord;
    setOrigin(dest);  setOriginCoord(destCoord);
    setDest(tmpText); setDestCoord(tmpCoord);
  }

  // ── 경로 탐색 ─────────────────────────────────────────────────────────────
  // 최적화된 로딩 순서:
  //   1. /route → OSRM 경로 + 안전점수 (한 번만 호출, /route-nearby 불필요)
  //   2. 지도 즉시 표시 (searched = true)
  //   3. 안심/최단 /markers 병렬 fetch + AI 메시지 (백그라운드)
  //   4. 마커 캐시 저장 → 경로 전환 시 재호출 없음
  async function handleSearch() {
    if (!origin || !dest) {
      alert('출발지와 목적지를 모두 입력해주세요!');
      return;
    }
    // 이미 검색 진행 중이면 무시 (더블클릭/빠른 재클릭으로 인한 중복 요청 방지)
    if (isSearchingRef.current) return;
    isSearchingRef.current = true;

    setLoading(true);
    setSearched(false);
    console.time('[전체] handleSearch');

    try {
      // ── 구간 1: 출발지/목적지 geocode (병렬 실행) ──────────────────────
      // origin/dest는 서로 의존성이 없으므로 Promise.all로 동시에 처리
      console.time('[1] geocode(병렬)');
      const [startCoord, endCoord] = await Promise.all([
        resolveCoord(origin, originCoord),
        resolveCoord(dest,   destCoord),
      ]);
      console.timeEnd('[1] geocode(병렬)');

      setOriginPos([startCoord.lat, startCoord.lng]);
      setDestPos([endCoord.lat, endCoord.lng]);

      // ── 구간 2: OSRM 경로 + 안전점수 (백엔드에서 합쳐서 응답) ───────────
      // ① OSRM 경로 탐색 — /route가 score 포함하여 반환, /route-nearby 불필요
      console.time('[2] /route (OSRM+점수계산)');
      const routeRes = await fetch(
        `${BACKEND_URL}/route?start_lat=${startCoord.lat}&start_lng=${startCoord.lng}` +
        `&end_lat=${endCoord.lat}&end_lng=${endCoord.lng}`
      );
      const osrmData = await routeRes.json();
      console.timeEnd('[2] /route (OSRM+점수계산)');
      if (osrmData.error) throw new Error(osrmData.error);

      // ② 안심(점수 최고) / 최단(거리 최소) 분리
      const safe  = [...osrmData.routes].sort((a, b) => b.score - a.score)[0];
      const short = [...osrmData.routes].sort((a, b) => a.distance - b.distance)[0];

      setSafeRoute(safe);
      setShortRoute(short);
      setSelectedRoute('safe');
      setLoading(false);

      // ③ 경로선 즉시 표시
      console.time('[3] 경로선 렌더링(setSearched)');
      setSearched(true);
      console.timeEnd('[3] 경로선 렌더링(setSearched)');
      // 주의: setState는 비동기라 이 timeEnd는 실제 리렌더 완료 시점이 아니라
      // "렌더링 예약까지 걸린 시간"만 잼. 실제 리렌더 소요는 아래 4번 참고.

      // ④ 안심/최단 경로가 동일하면 마커 요청 1번만
      const isSameRoute = (
        JSON.stringify(safe.positions[0])    === JSON.stringify(short.positions[0]) &&
        JSON.stringify(safe.positions.at(-1)) === JSON.stringify(short.positions.at(-1)) &&
        safe.positions.length === short.positions.length
      );

      const fetchMarkers = (positions) =>
        fetch(`${BACKEND_URL}/markers?positions=${encodeURIComponent(JSON.stringify(positions))}&radius=50`)
          .then(r => r.json());

      // ⑤ 안심 마커, 최단 마커(필요 시) — 먼저 병렬 실행 후 즉시 화면 반영
      //   AI 메시지는 여기서 기다리지 않고 별도로 백그라운드 실행
      //   (AI 호출이 8~11초 걸려도 마커 표시는 지연되지 않도록 분리)
      console.time('[4] 마커(병렬)');
      const [safeMarkers, shortMarkers] = await Promise.all([
        fetchMarkers(safe.positions),
        isSameRoute ? Promise.resolve(null) : fetchMarkers(short.positions),
      ]);
      console.timeEnd('[4] 마커(병렬)');

      isAiBusyRef.current = true;
      console.time('[5] AI메시지(백그라운드)');
      fetchAiMessage('safe', safe, safe, short)
        .finally(() => {
          console.timeEnd('[5] AI메시지(백그라운드)');
          isAiBusyRef.current = false;
        });

      // 지도 마커 — 현재 선택 경로(안심) 기준
      setCctvData(safeMarkers.cctv);
      setLightsData(safeMarkers.lights);
      setPoliceData(safeMarkers.police);
      setBellData(safeMarkers.bell);

      // 마커 캐시 저장
      setSafeMarkerCache(safeMarkers);
      setShortMarkerCache(shortMarkers ?? safeMarkers);

      // Header용 — 안심+최단 합산 후 lat+lng 기준 중복 제거
      const dedupe = (arr1, arr2) => {
        const seen  = new Set(arr1.map(i => `${i.lat},${i.lng}`));
        const extra = (arr2 || []).filter(i => !seen.has(`${i.lat},${i.lng}`));
        return arr1.length + extra.length;
      };
      setAllCctvCount(dedupe(safeMarkers.cctv, shortMarkers?.cctv));
      setAllLightsCount(dedupe(safeMarkers.lights, shortMarkers?.lights));

      console.timeEnd('[전체] handleSearch');
      isSearchingRef.current = false;
    } catch (e) {
      console.error(e);
      alert('오류가 발생했어요. 다시 시도해주세요!');
      setLoading(false);
      setAiLoading(false);
      console.timeEnd('[전체] handleSearch');
      isSearchingRef.current = false;
    }
  }

  // ── 경로 전환 — 캐시 사용, /markers 재호출 없음 ──────────────────────────
  async function handleRouteChange(type) {
    if (type === selectedRoute) return;
    // 이미 경로 전환(AI 메시지 생성) 처리 중이면 무시 — 빠른 연속 클릭 방지
    if (isAiBusyRef.current) return;
    isAiBusyRef.current = true;

    setSelectedRoute(type);
    const target = type === 'safe' ? safeRoute : shortRoute;
    if (!target) { isAiBusyRef.current = false; return; }

    // 캐시된 마커 즉시 적용
    const cached = type === 'safe' ? safeMarkerCache : shortMarkerCache;
    if (cached) {
      setCctvData(cached.cctv);
      setLightsData(cached.lights);
      setPoliceData(cached.police);
      setBellData(cached.bell);
    }

    // AI 메시지만 새로 생성
    try {
      await fetchAiMessage(type, target, safeRoute, shortRoute);
    } catch (e) {
      console.error('AI 메시지 생성 실패:', e);
    } finally {
      isAiBusyRef.current = false;
    }
  }

  // ── 긴급: 현재 위치 기준 가까운 안전시설 조회 → 팝업 표시 ──────────────────
  function openEmergency() {
    if (!navigator.geolocation) { alert('위치 기능을 사용할 수 없어요.'); return; }
    setEmergencyLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude, lng = pos.coords.longitude;
          const res  = await fetch(`${BACKEND_URL}/nearest?lat=${lat}&lng=${lng}`);
          const data = await res.json();
          setEmergency({ ...data, currentPos: { lat, lng } });
        } catch (e) {
          alert('가까운 안전시설을 불러오지 못했어요.');
        } finally {
          setEmergencyLoading(false);
        }
      },
      () => { setEmergencyLoading(false); alert('현재 위치를 가져오지 못했어요.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ── 긴급: 선택한 시설로 즉시 최단 경로 안내 시작 ─────────────────────────
  function startEmergencyNav(facility) {
    if (!facility || !emergency) return;
    setOriginPos([emergency.currentPos.lat, emergency.currentPos.lng]);
    setDestPos([facility.lat, facility.lng]);
    setSelectedRoute('short'); // 대피는 최단 경로
    setIsSimMode(false);
    setEmergencyNav(true);      // routeData=null 로 새 경로 계산하도록
    setEmergency(null);
    setIsNavigating(true);
  }

  // 거리 표시 헬퍼
  const fmtDist = (d) => (d == null ? '' : d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d} m`);

  // ── 내비게이션 화면 ───────────────────────────────────────────────────────
  if (isNavigating && originPos && destPos) {
    return (
      <NavigationMap
        start={originPos}
        end={destPos}
        simMode={isSimMode}
        routeType={selectedRoute}
        routeData={emergencyNav ? null : (selectedRoute === 'safe' ? safeRoute : shortRoute)}
        cctvData={cctvData}
        lightsData={lightsData}
        policeData={policeData}
        bellData={bellData}
        onExit={() => { setIsNavigating(false); setIsSimMode(false); setEmergencyNav(false); }}
      />
    );
  }

  // ── 메인 화면 ─────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <Header cctvCount={allCctvCount} lightsCount={allLightsCount} originCoord={originCoord} />

      <SearchBar
        origin={origin}
        dest={dest}
        setOrigin={(t) => { setOrigin(t); setOriginCoord(null); }}
        setDest={(t)   => { setDest(t);   setDestCoord(null);   }}
        onSearch={handleSearch}
        onSelectOrigin={(c) => setOriginCoord(c)}
        onSelectDest={(c)   => setDestCoord(c)}
        onSwap={handleSwap}
        loading={loading}
      />

      {loading && (
        <div className="loading-bar">
          <div className="loading-bar-inner" />
          <span className="loading-text">경로를 탐색하고 있어요...</span>
        </div>
      )}

      {searched && safeRoute && shortRoute && (
        <div className="results-panel">
          <RouteCard
            selectedRoute={selectedRoute}
            safeRoute={safeRoute}
            shortRoute={shortRoute}
            onSelect={handleRouteChange}
            disabled={aiLoading}
          />

          <AiGuide aiMessage={aiMessage} aiLoading={aiLoading} />

          <MapView
            selectedRoute={selectedRoute}
            safeRoute={safeRoute}
            shortRoute={shortRoute}
            cctvData={cctvData}
            lightsData={lightsData}
            policeData={policeData}
            bellData={bellData}
            origin={origin}
            dest={dest}
            originPos={originPos}
            destPos={destPos}
            onRouteSelect={handleRouteChange}
          />

          <div className="btn-row">
            <button
            className="btn-nav"
            onClick={() => { setIsSimMode(false); setIsNavigating(true); }}
          >
          <FiNavigation size={18} /> 경로 안내
          </button>
            <button
            className="btn-sim"
            onClick={() => { setIsSimMode(true); setIsNavigating(true); }}
          >
            <FiPlay size={18} /> 시뮬레이션
          </button>
        </div>
      </div>
    )}

      {/* ── 긴급 대피 FAB (항상 표시, 우하단 고정) ── */}
      <button
        className="emergency-fab"
        onClick={openEmergency}
        disabled={emergencyLoading}
        title="가까운 안전시설로 대피"
      >
        {emergencyLoading
          ? <span className="fab-spinner" />
          : <><FaShieldAlt size={20} /><span className="fab-label">대피</span></>}
      </button>

      {/* ── 긴급 대피 선택 팝업 ── */}
      {emergency && (
        <div className="emergency-overlay" onClick={() => setEmergency(null)}>
          <div className="emergency-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="emergency-title">🛡 가까운 안전시설로 대피</div>
            <div className="emergency-sub">현재 위치에서 가장 가까운 곳으로 안내합니다</div>

            {emergency.police && (
              <button className="emergency-opt" onClick={() => startEmergencyNav(emergency.police)}>
                <FaShieldAlt size={20} color="#4A90E2" />
                <div className="emergency-opt-text">
                  <span className="emergency-opt-label">경찰서</span>
                  <span className="emergency-opt-addr">{emergency.police.address || '가까운 경찰서'}</span>
                </div>
                <span className="emergency-opt-dist">{fmtDist(emergency.police.dist)}</span>
              </button>
            )}

            {emergency.cctv && (
              <button className="emergency-opt" onClick={() => startEmergencyNav(emergency.cctv)}>
                <MdVideocam size={22} color="#56CCF2" />
                <div className="emergency-opt-text">
                  <span className="emergency-opt-label">CCTV 지역</span>
                  <span className="emergency-opt-addr">{emergency.cctv.address || 'CCTV 설치 구역'}</span>
                </div>
                <span className="emergency-opt-dist">{fmtDist(emergency.cctv.dist)}</span>
              </button>
            )}

            {emergency.lights && (
              <button className="emergency-opt" onClick={() => startEmergencyNav(emergency.lights)}>
                <MdLightbulb size={22} color="#FAC775" />
                <div className="emergency-opt-text">
                  <span className="emergency-opt-label">보안등</span>
                  <span className="emergency-opt-addr">{emergency.lights.address || '보안등 설치 구역'}</span>
                </div>
                <span className="emergency-opt-dist">{fmtDist(emergency.lights.dist)}</span>
              </button>
            )}

            <button className="emergency-cancel" onClick={() => setEmergency(null)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;