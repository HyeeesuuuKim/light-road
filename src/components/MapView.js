/**
 * MapView.js — 메인 화면 지도 컴포넌트
 *
 * 주요 기능:
 *   1. 안심 경로(파란 실선)와 최단 경로(주황 점선)를 지도에 동시 표시
 *   2. 경로선 클릭 또는 범례 버튼 클릭으로 경로 선택
 *   3. 선택된 경로: 굵고 불투명한 실선 / 비선택 경로: 얇고 반투명한 점선
 *   4. 두 경로가 모두 보이도록 지도 범위(fitBounds) 자동 조정
 *   5. 경로 주변 시설물(CCTV·가로등·경찰서·비상벨) 원형 마커 표시
 */

import { useEffect, useRef } from 'react';

function MapView({
  selectedRoute, safeRoute, shortRoute,
  cctvData, lightsData, policeData, bellData,
  origin, dest, originPos, destPos,
  onRouteSelect,
}) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const markersRef  = useRef([]);     // 시설물 마커/서클 목록 (제거용)
  const safePolyRef  = useRef(null);  // 안심 경로 폴리라인
  const shortPolyRef = useRef(null);  // 최단 경로 폴리라인

  // ── 지도 초기화 (최초 1회) ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !window.naver) return;
    if (mapInstance.current) return; // 이미 초기화됐으면 스킵
    mapInstance.current = new window.naver.maps.Map(mapRef.current, {
      center: new window.naver.maps.LatLng(37.0130, 127.2750),
      zoom: 14,
    });
  }, []);

  // ── 두 경로를 지도에 동시 그리기 ─────────────────────────────────────────
  // safeRoute 또는 shortRoute가 바뀔 때, 또는 선택 경로가 바뀔 때 재실행.
  useEffect(() => {
    if (!mapInstance.current || !safeRoute || !shortRoute) return;

    // 기존 경로선 제거 후 재그리기
    if (safePolyRef.current)  { safePolyRef.current.setMap(null);  safePolyRef.current  = null; }
    if (shortPolyRef.current) { shortPolyRef.current.setMap(null); shortPolyRef.current = null; }

    if (originPos) {
      mapInstance.current.setCenter(new window.naver.maps.LatLng(originPos[0], originPos[1]));
      mapInstance.current.setZoom(15);
    }

    // ── 최단 경로 (주황색) ───────────────────────────────────────────────
    // 먼저 그려야 안심 경로(파란색) 아래에 위치함 (레이어 순서)
    const shortSelected = selectedRoute === 'short';
    shortPolyRef.current = new window.naver.maps.Polyline({
      path: shortRoute.positions.map(p => new window.naver.maps.LatLng(p[0], p[1])),
      strokeColor:   '#FAC775',                          // 주황색
      strokeWeight:  shortSelected ? 8 : 4,             // 선택: 굵게 / 비선택: 얇게
      strokeOpacity: shortSelected ? 0.95 : 0.45,       // 선택: 불투명 / 비선택: 반투명
      strokeStyle:   shortSelected ? 'solid' : 'shortdash', // 선택: 실선 / 비선택: 점선
      map: mapInstance.current,
    });
    // 경로선 클릭 이벤트 등록 → 클릭하면 최단 경로로 선택됨
    window.naver.maps.Event.addListener(shortPolyRef.current, 'click', () => {
      if (onRouteSelect) onRouteSelect('short');
    });

    // ── 안심 경로 (파란색) ───────────────────────────────────────────────
    // 나중에 그려야 최단 경로 위에 표시됨
    const safeSelected = selectedRoute === 'safe';
    safePolyRef.current = new window.naver.maps.Polyline({
      path: safeRoute.positions.map(p => new window.naver.maps.LatLng(p[0], p[1])),
      strokeColor:   '#56CCF2',
      strokeWeight:  safeSelected ? 8 : 4,
      strokeOpacity: safeSelected ? 0.95 : 0.45,
      strokeStyle:   safeSelected ? 'solid' : 'shortdash',
      map: mapInstance.current,
    });
    window.naver.maps.Event.addListener(safePolyRef.current, 'click', () => {
      if (onRouteSelect) onRouteSelect('safe');
    });

    // ── 지도 범위 자동 조정 ─────────────────────────────────────────────
    // 두 경로의 모든 좌표를 포함하는 최소 영역으로 지도를 맞춤.
    // fitBounds padding으로 경로가 화면 가장자리에 붙지 않도록 여백 추가.
    const allCoords = [
      ...safeRoute.positions,
      ...shortRoute.positions,
    ].map(p => new window.naver.maps.LatLng(p[0], p[1]));
    const bounds = new window.naver.maps.LatLngBounds();
    allCoords.forEach(c => bounds.extend(c));
    mapInstance.current.fitBounds(bounds, { top: 60, right: 30, bottom: 60, left: 30 });

  }, [safeRoute, shortRoute, selectedRoute, originPos, onRouteSelect]);

  // ── 선택 경로 변경 시 폴리라인 스타일만 업데이트 ─────────────────────────
  // 경로 데이터가 바뀌지 않고 선택만 바뀔 때는 재그리기 없이 스타일만 변경.
  useEffect(() => {
    if (!safePolyRef.current || !shortPolyRef.current) return;
    const safeSelected  = selectedRoute === 'safe';
    const shortSelected = selectedRoute === 'short';

    safePolyRef.current.setOptions({
      strokeWeight:  safeSelected ? 8 : 4,
      strokeOpacity: safeSelected ? 0.95 : 0.45,
      strokeStyle:   safeSelected ? 'solid' : 'shortdash',
    });
    shortPolyRef.current.setOptions({
      strokeWeight:  shortSelected ? 8 : 4,
      strokeOpacity: shortSelected ? 0.95 : 0.45,
      strokeStyle:   shortSelected ? 'solid' : 'shortdash',
    });
  }, [selectedRoute]);

  // ── 시설물 마커 갱신 (선택 경로 변경 시) ─────────────────────────────────
  // 경로 전환 시 해당 경로 주변 시설물 데이터로 마커를 새로 그림.
  useEffect(() => {
    if (!mapInstance.current) return;

    // 기존 마커/서클 전부 제거
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // 원형 마커 생성 헬퍼
    const addCircle = (lat, lng, color, radius) => {
      const c = new window.naver.maps.Circle({
        center: new window.naver.maps.LatLng(lat, lng),
        radius,
        fillColor:   color,
        fillOpacity: 0.75,
        strokeWeight: 0,
        map: mapInstance.current,
      });
      markersRef.current.push(c);
    };

    // 출발지·목적지 마커
    if (originPos) {
      const m = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(originPos[0], originPos[1]),
        map: mapInstance.current, title: `출발: ${origin}`,
      });
      markersRef.current.push(m);
    }
    if (destPos) {
      const m = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(destPos[0], destPos[1]),
        map: mapInstance.current, title: `도착: ${dest}`,
      });
      markersRef.current.push(m);
    }

    // 시설물별 색상과 크기 구분
    // 경찰서(16)·비상벨(14)을 CCTV(8)·가로등(8)보다 크게 → 지도에서 구분 용이
    cctvData.forEach(i   => addCircle(i.lat, i.lng, '#56CCF2', 8));   // 하늘색
    lightsData.forEach(i => addCircle(i.lat, i.lng, '#FAC775', 8));   // 노란색
    policeData.forEach(i => addCircle(i.lat, i.lng, '#4A90E2', 16));  // 파란색 (크게)
    bellData.forEach(i   => addCircle(i.lat, i.lng, '#E24B4A', 14));  // 빨간색 (크게)

  }, [cctvData, lightsData, policeData, bellData, originPos, destPos, origin, dest]);

  return (
    <div className="map-card">
      <div ref={mapRef} style={{ height: '400px', width: '100%' }} />

      {/* 범례 + 경로 선택 버튼 */}
      <div className="map-legend">
        <div className="legend-routes">
          {/* 버튼 클릭으로도 경로 선택 가능 (경로선 클릭과 동일 효과) */}
          <button
            className={`legend-route-btn ${selectedRoute === 'safe' ? 'active' : ''}`}
            style={{ '--route-color': '#56CCF2' }}
            onClick={() => onRouteSelect && onRouteSelect('safe')}
          >
            <span className="legend-line safe-line" />
            안심 경로
          </button>
          <button
            className={`legend-route-btn ${selectedRoute === 'short' ? 'active' : ''}`}
            style={{ '--route-color': '#FAC775' }}
            onClick={() => onRouteSelect && onRouteSelect('short')}
          >
            <span className="legend-line short-line" />
            최단 경로
          </button>
        </div>
        <div className="legend-facilities">
          <span style={{ color: '#56CCF2' }}>● CCTV</span>
          <span style={{ color: '#FAC775' }}>● 가로등</span>
          <span style={{ color: '#4A90E2' }}>● 경찰서</span>
          <span style={{ color: '#E24B4A' }}>● 비상벨</span>
        </div>
      </div>
    </div>
  );
}

export default MapView;
