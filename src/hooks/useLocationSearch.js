import { useState, useEffect, useRef, useCallback } from 'react';

const TMAP_API_KEY = process.env.REACT_APP_TMAP_API_KEY;

/**
 * Haversine 거리 계산 (km)
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * TMAP POI 장소 검색 커스텀 훅
 *
 * @param {string} query        - 검색어
 * @param {{ lat: number, lng: number } | null} userLocation - 현 위치 (근거리 우선 정렬용)
 * @returns {{ suggestions: Array, loading: boolean }}
 *
 * suggestions 항목 구조:
 *   { id, label, address, lat, lng, distKm }
 *   - label   : 장소명 (드롭다운 큰 글씨)
 *   - address : 주소 요약 (드롭다운 작은 글씨)
 *   - distKm  : 현 위치 기준 거리 (뱃지 표시용, userLocation 없으면 null)
 *   - lat/lng : noorLat/noorLon — 경로 탐색에 바로 사용 가능
 */
export function useLocationSearch(query, userLocation) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef(null);

  const search = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        version: '1',
        searchKeyword: q,
        searchType: 'all',
        searchtypCd: 'A',
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        count: '10',
        multiPoint: 'N',
        poiGroupYn: 'N',
      });

      // 현 위치가 있으면 TMAP 서버 측에서 근거리 우선 정렬
      if (userLocation) {
        params.set('centerLat', String(userLocation.lat));
        params.set('centerLon', String(userLocation.lng));
      }

      const res = await fetch(
        `https://apis.openapi.sk.com/tmap/pois?${params.toString()}`,
        {
          headers: {
            Accept: 'application/json',
            appKey: TMAP_API_KEY,
          },
        }
      );

      const data = await res.json();
      const poiList = data?.searchPoiInfo?.pois?.poi ?? [];

      const results = poiList.map((poi) => {
        // frontLat/frontLon: 시설 입구(도로 접근점) 좌표 — 도로에 더 가까워 OSRM 경로 탐색에 유리
        // frontLat가 없거나 0이면 noorLat/noorLon으로 fallback
        const rawFrontLat = parseFloat(poi.frontLat);
        const rawFrontLon = parseFloat(poi.frontLon);
        const lat = (rawFrontLat && rawFrontLat !== 0) ? rawFrontLat : parseFloat(poi.noorLat);
        const lng = (rawFrontLon && rawFrontLon !== 0) ? rawFrontLon : parseFloat(poi.noorLon);

        // 현 위치 기준 거리 계산 (뱃지 표시용)
        const distKm = userLocation
          ? haversineDistance(userLocation.lat, userLocation.lng, lat, lng)
          : null;

        // 주소 조합: 도로명 주소 우선 (newAddressList), 없으면 동 주소 fallback
        const roadAddr = poi.newAddressList?.newAddress?.[0]?.fullAddressRoad?.trim();
        const dongAddrParts = [
          poi.upperAddrName,
          poi.middleAddrName,
          poi.lowerAddrName,
        ].filter(Boolean);
        const address = roadAddr || dongAddrParts.join(' ');

        return {
          id: poi.id ?? poi.pkey,
          label: poi.name,   // 장소명 — 큰 글씨
          address,           // 주소 요약 — 작은 글씨
          lat,
          lng,
          distKm,            // 거리 뱃지용
        };
      });

      // 정렬은 TMAP 서버(centerLat/centerLon)가 처리 — 클라이언트 sort 불필요

      setSuggestions(results);
    } catch (err) {
      console.error('TMAP POI 검색 오류:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(query), 300);
    return () => clearTimeout(debounceTimer.current);
  }, [query, search]);

  return { suggestions, loading };
}