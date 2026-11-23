/**
 * gemini.js
 * AI 안심 가이드 메시지 생성 모듈
 *
 * 외부에 노출하는 함수: getAiMessage(routeData)
 *
 * ※ 변경: Gemini를 브라우저에서 직접 호출하지 않고 백엔드(/ai-guide)를 거쳐 호출.
 *   → API 키가 프론트 코드에 들어가지 않음. 프롬프트 조립도 백엔드(server.py)로 이동.
 *   첫 문장 생성·폴백 메시지는 백엔드 실패 시 대비용으로 프론트에 그대로 유지.
 *
 * routeData 형태:
 * {
 *   routeType : 'safe' | 'short',
 *   safeScore : number,   // 안심 경로 안전 점수
 *   shortScore: number,   // 최단 경로 안전 점수
 *   lights    : number,   // 가로등 수
 *   cctvs     : number,   // CCTV 수
 *   distance  : number,   // 거리 (km)
 *   duration  : number,   // 소요 시간 (분)
 *   otherDistance, otherDuration, otherLights, otherCctvs : 비교 대상 경로 정보
 *   sameRoute : boolean,  // 안심·최단이 같은 길인지
 * }
 */

const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'https://localhost:8000'
  : (process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000');

// ── 시간대 판정 ─────────────────────────────────────────
// 백엔드(server.py)와 같은 기준: 22시~06시는 야간.
// 캐시 키와 폴백 문장 모두 이 함수를 써서 기준이 어긋나지 않게 함.
function isNightNow() {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

// ── 캐시 ────────────────────────────────────────────────
// 같은 경로 데이터로 반복 호출 시 백엔드를 재호출하지 않고 캐시된 결과 반환.
// 앱 세션 동안 유지되며 새로고침 시 초기화됨.
// ※ 설치한 앱을 백그라운드에 오래 띄워두면 세션이 길게 유지되므로,
//   캐시 키에 시간대(주간/야간)를 포함해 시간대가 바뀌면 새로 받아오도록 함.
const aiMessageCache = new Map();

function buildCacheKey(routeData) {
  const { routeType, safeScore, shortScore, lights, cctvs, distance, sameRoute,
          otherDistance, otherLights, otherCctvs } = routeData;
  return `${routeType}-${safeScore}-${shortScore}-${lights}-${cctvs}-${distance}` +
         `-${sameRoute}-${otherDistance}-${otherLights}-${otherCctvs}` +
         `-${isNightNow() ? 'night' : 'day'}`;
}


// ════════════════════════════════════════════════════════
// 1. 첫 문장 생성 (경로 타입 + 점수 차이 기준) — AI 실패 시 폴백용
// ════════════════════════════════════════════════════════

function buildFirstSentence(routeType, safeScore, shortScore, sameRoute) {
  // 안심·최단이 같은 길이면 "더 고른 경로" 같은 비교 문장은 사실과 맞지 않으므로 따로 처리
  if (sameRoute) {
    return '안심 경로와 최단 경로가 같은 길입니다. 가장 빠르면서 안전 시설도 함께 갖춘 경로로 안내해 드립니다.';
  }
  const diff = safeScore - shortScore;

  if (routeType === 'safe') {
    if (diff >= 10) {
      return '최단 경로보다 안전 점수가 크게 높은 경로입니다. 가로등과 CCTV가 잘 갖춰진 구간으로 안내해 드립니다.';
    } else if (diff >= 5) {
      return '최단 경로보다 안전 시설이 더 잘 갖춰진 경로입니다.';
    } else {
      return '두 경로의 안전 수준은 비슷하지만, 보안 시설 배치가 더 고른 경로를 안내해 드립니다.';
    }
  } else {
    if (diff >= 10) {
      return '목적지까지 가장 빠르게 이동할 수 있는 경로입니다. 안심 경로보다 이동 시간이 짧은 만큼, 주변을 살피며 이동하시길 권장합니다.';
    } else if (diff >= 5) {
      return '목적지까지 빠르게 이동할 수 있는 경로입니다. 이동 중 주변에 조금 더 주의를 기울여 주세요.';
    } else {
      return '두 경로의 안전 수준은 비슷합니다. 목적지까지 가장 빠르게 이동할 수 있는 경로를 안내해 드립니다.';
    }
  }
}


// ════════════════════════════════════════════════════════
// 2. 폴백 브리핑 (AI 실패 시 규칙 기반으로 직접 생성)
// ════════════════════════════════════════════════════════

function buildFallback(routeData, firstSentence) {
  const { lights, cctvs, distance } = routeData;
  const distanceM = Math.round(distance * 1000);

  const cctvInterval = cctvs > 0 ? Math.round(distanceM / cctvs) : null;
  const cctvSentence = cctvInterval
    ? `약 ${cctvInterval}m마다 CCTV가 배치되어 사각지대를 최소화한 경로입니다.`
    : 'CCTV가 주요 구간에 배치되어 있습니다.';

  const lightsInterval = lights > 0 ? Math.round(distanceM / lights) : null;
  const lightsSentence = lightsInterval
    ? `약 ${lightsInterval}m마다 가로등이 설치되어 어두운 구간이 적습니다.`
    : '';

  const timeSentence = isNightNow()
    ? '인적이 드문 시간대인 만큼, 주변을 살피며 이동하시길 권장합니다.'
    : '안심하고 이동하세요.';

  return [firstSentence, cctvSentence, lightsSentence, timeSentence]
    .filter(Boolean)
    .join(' ');
}


// ════════════════════════════════════════════════════════
// 3. 외부 인터페이스
// ════════════════════════════════════════════════════════

export async function getAiMessage(routeData) {
  const { routeType, safeScore, shortScore, lights, cctvs, distance, duration,
          otherDistance, otherDuration, otherLights, otherCctvs, sameRoute } = routeData;
  const firstSentence = buildFirstSentence(routeType, safeScore, shortScore, sameRoute);

  // ── 캐시 확인: 동일한 경로 데이터 + 같은 시간대면 재호출 없이 반환 ──
  const cacheKey = buildCacheKey(routeData);
  if (aiMessageCache.has(cacheKey)) {
    console.log('[AI] 캐시 사용:', cacheKey);
    return aiMessageCache.get(cacheKey);
  }

  try {
    const res = await fetch(`${BACKEND_URL}/ai-guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeType, safeScore, shortScore, lights, cctvs, distance, duration,
        otherDistance, otherDuration, otherLights, otherCctvs, sameRoute: !!sameRoute,
      }),
    });

    const data = await res.json().catch(() => null);

    // 실패(한도 초과·키 미설정·응답 없음 등): 폴백 반환, 캐시 저장 안 함 — 나중에 다시 시도할 수 있도록
    if (!res.ok || !data || !data.message) {
      console.warn('[AI] 실패 → 폴백 사용:', data?.error || res.status);
      return buildFallback(routeData, firstSentence);
    }

    // ── 성공한 응답만 캐시에 저장 ──
    aiMessageCache.set(cacheKey, data.message);
    return data.message;
  } catch (e) {
    console.error('[AI 오류]', e);
    return buildFallback(routeData, firstSentence);
  }
}