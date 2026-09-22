/**
 * geoUtils.js — 지구 구면체 기반 지리 계산 유틸리티
 *
 * [왜 단순 피타고라스를 쓰지 않는가?]
 * 위경도를 평면 좌표처럼 다루면 지구 곡면 때문에 오차가 생김.
 * 예) 서울(37°N) 기준으로 경도 1° ≈ 88.7km, 위도 1° ≈ 111km → 비율이 다름.
 * Haversine 공식은 구면 삼각법을 사용해 실제 지표면 거리를 정확히 계산.
 */

/**
 * Haversine 공식으로 두 좌표 사이 거리(m) 계산
 *
 * [공식 원리]
 *   a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)
 *   c = 2 × atan2(√a, √(1-a))
 *   d = R × c    (R = 지구 반지름 6,371,000m)
 *
 * [사용처]
 *   - 내비게이션: 현재 GPS 위치 ~ 다음 턴 포인트 거리 계산
 *   - 이상 정지 감지: GPS 업데이트 간 이동 거리로 속도 추정
 *   - 경로 이탈 감지: 현재 위치 ~ 경로선 최근접 좌표 거리 계산
 *   - 출발지 접근 감지: 현재 위치 ~ 출발지 거리 계산
 */
export function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 지구 반지름 (미터)

  // 위도·경도 차이를 라디안으로 변환
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  // Haversine 공식 계산
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;

  // atan2를 쓰는 이유: 분모가 0이 되는 경우(정반대 지점)에도 안전하게 처리
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 두 좌표 사이의 방위각(bearing) 계산 (0~360°)
 *
 * [방위각이란?]
 *   북쪽(0°)을 기준으로 시계방향으로 측정한 각도.
 *   예) 북 = 0°, 동 = 90°, 남 = 180°, 서 = 270°
 *
 * [사용처]
 *   - 내비게이션 화살표: 현재 위치 → 다음 경로 좌표 방향 계산
 *   - 지도 회전(heading): 이동 방향이 화면 위쪽을 향하도록 지도 회전
 *   - 화살표 보정: 방위각 - 기기 나침반 = 화살표가 틀어져야 할 각도
 *
 * [atan2 사용 이유]
 *   sin/cos 비율로 각도를 구하는데, atan2는 4개 사분면을 모두 올바르게 처리함.
 *   +360) % 360: atan2 결과가 -180~180이므로 0~360으로 정규화.
 */
export function calcBearing(lat1, lng1, lat2, lng2) {
  const dLng  = (lng2 - lng1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) -
             Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);

  // atan2(y, x)로 각도 계산 후 도(°) 단위로 변환, 0~360 범위로 정규화
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
