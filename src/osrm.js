/**
 * osrm.js — 경로 데이터 fetch 모듈
 *
 * [핵심 최적화: routeData 캐시]
 * App.js는 경로 탐색 시 이미 safeRoute/shortRoute 데이터를 가지고 있음.
 * 경로 안내(NavigationMap) 진입 시 이 데이터를 props로 전달하면
 * /route 재호출 없이 즉시 사용 가능 → 내비 진입 속도 개선.
 *
 * routeData가 없는 경우(직접 호출)에만 백엔드를 호출하는 fallback 구조.
 */

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'https://127.0.0.1:8000'
  : (process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000');

/**
 * 경로 데이터를 가져오는 함수
 *
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @param {'safe'|'short'} routeType
 *   - 'safe' : 안전 점수 최고 경로 (server.py가 routes[0]으로 반환)
 *   - 'short': 거리 최단 경로 (클라이언트에서 distance 기준 재정렬)
 * @param {object|null} routeData
 *   App.js에서 이미 받아둔 경로 객체.
 *   있으면 /route 재호출 없이 즉시 반환 (내비게이션 진입 시 사용).
 * @returns {{ coordinates: [number, number][], steps: object[] }}
 */
export async function fetchRoute(startLat, startLng, endLat, endLng, routeType = 'safe', routeData = null) {

  // ── 캐시 확인: App.js에서 이미 받아둔 데이터가 있으면 재호출 생략 ─────────
  // positions(좌표 배열)와 steps(턴바이턴)이 모두 있어야 유효한 캐시로 판단
  if (routeData && routeData.positions && routeData.steps) {
    return {
      coordinates: routeData.positions,
      steps:       routeData.steps,
    };
  }

  // ── fallback: routeData가 없는 경우에만 백엔드 호출 ──────────────────────
  const res = await fetch(
    `${BACKEND_URL}/route?start_lat=${startLat}&start_lng=${startLng}` +
    `&end_lat=${endLat}&end_lng=${endLng}`
  );
  const data = await res.json();

  if (data.error) throw new Error(data.error);
  if (!data.routes || data.routes.length === 0) {
    throw new Error('경로를 찾을 수 없습니다.');
  }

  // ── routeType에 따라 경로 선택 ───────────────────────────────────────────
  // server.py의 /route는 안전 점수 기준 내림차순으로 정렬하여 반환하므로
  // 'safe': routes[0] (이미 안전 점수 1위)
  // 'short': 거리 기준으로 재정렬 후 1위 선택
  let best;
  if (routeType === 'short') {
    best = [...data.routes].sort((a, b) => a.distance - b.distance)[0];
  } else {
    best = data.routes[0];
  }

  return {
    coordinates: best.positions,
    steps:       best.steps,
  };
}
