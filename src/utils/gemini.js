/**
 * gemini.js
 * AI 안심 가이드 메시지 생성 모듈
 *
 * 외부에 노출하는 함수: getAiMessage(routeData)
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
 * }
 */

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── 캐시 ────────────────────────────────────────────────
// 같은 경로 데이터로 반복 호출 시 Gemini API를 재호출하지 않고 캐시된 결과 반환.
// 429 (rate limit) 방지 목적. 앱 세션 동안 유지되며 새로고침 시 초기화됨.
const aiMessageCache = new Map();

function buildCacheKey(routeData) {
  const { routeType, safeScore, shortScore, lights, cctvs, distance } = routeData;
  return `${routeType}-${safeScore}-${shortScore}-${lights}-${cctvs}-${distance}`;
}


// ════════════════════════════════════════════════════════
// 1. 첫 문장 생성 (경로 타입 + 점수 차이 기준)
// ════════════════════════════════════════════════════════

function buildFirstSentence(routeType, safeScore, shortScore) {
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
// 2. 프롬프트 조립
// ════════════════════════════════════════════════════════

function buildPrompt(routeData, firstSentence) {
  const { routeType, safeScore, shortScore, lights, cctvs, distance, duration } = routeData;

  const now = new Date();
  const currentTime = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const hour = now.getHours();
  // ── 핵심 수정: JS가 직접 시간대를 판단해서 명시적으로 전달 ──
  // Gemini에 시각만 넘기면 파싱 오류나 느슨한 해석으로 오판 가능
  const isNight = hour >= 22 || hour < 6;
  const timeCategory = isNight
    ? '야간 (22시~06시) — 주의 깊은 어조를 반드시 사용할 것'
    : '주간 (06시~22시) — 일반 안심 어조를 사용할 것. 야간 관련 멘트 절대 포함 금지';

  const routeLabel = routeType === 'safe' ? '안심 경로' : '최단 경로';

  return `# Role
너는 야간 귀가 안전 경로 안내 서비스 'Light-Road'의 AI 안심 가이드야.
경로 데이터를 분석해 사용자가 안심하고 귀가할 수 있도록 맞춤형 안내 메시지를 작성하는 역할을 해.

# Input Data
- 경로 성격: ${routeLabel} (safe: 안심 경로 / short: 최단 경로)
- 안심 경로 점수: ${safeScore}점 / 최단 경로 점수: ${shortScore}점
- 인프라: 가로등 ${lights}개, CCTV ${cctvs}개
- 경로 거리: ${distance}km
- 소요 시간: ${duration}분
- 현재 시각: ${currentTime}
- 시간대 분류: ${timeCategory}

# Instructions
1. 첫 문장은 반드시 아래 [첫 문장]을 그대로 사용할 것.
2. 안전 점수 수치를 직접 언급하지 말 것.
   '높은 점수', '낮은 점수', 구체적 점수 수치 등 절댓값 평가 표현 금지.
   점수 비교가 필요하면 반드시 상대 비교로만 표현할 것.
   예) "안심 경로는 최단 경로보다 안전 시설이 더 잘 갖춰져 있습니다."
3. 가로등·CCTV 수는 단순 나열하지 말 것. 경로 거리 대비 밀도를 계산하여 사용자가 체감할 수 있는 표현으로 변환할 것.
   예) "약 100m마다 CCTV가 배치되어 사각지대를 최소화한 경로입니다."
   단, 가로등 또는 CCTV가 0개이면 해당 항목은 언급하지 말 것.
4. [시간대 분류]가 야간이면 주의 깊은 어조로 작성할 것.
   예) "인적이 드문 시간대인 만큼, 주변을 살피며 이동하시길 권장합니다."
   [시간대 분류]가 주간이면 밝고 안심되는 어조로 작성할 것.
   예) "활동이 활발한 시간대이니 편안하게 이동하세요."
   주간에는 '야간', '어두운', '인적', '늦은 시각' 등 야간 관련 표현을 절대 포함하지 말 것.
5. '위험', '취약', '부족', '적다' 등 부정적인 단어는 절대 사용하지 말 것.
   대신 '주의', '집중', '권장', '살피다' 등 행동 중심 표현을 사용할 것.
6. 수치는 과장하지 말고, 사실에 기반한 안심 포인트를 짚을 것.
7. 최단 경로일 경우, 빠름을 언급한 뒤 주의 행동을 자연스럽게 유도할 것. 위협적인 표현은 금지.

# Output Format
- 반드시 2~3문장 이내로 작성할 것.
- 자연스러운 한국어 존댓말로 작성할 것.
- 문장 외 부가 설명, 제목, 기호 등 일절 출력하지 말 것.

[첫 문장]
${firstSentence}`;
}


// ════════════════════════════════════════════════════════
// 3. 폴백 브리핑 (Gemini 실패 시 규칙 기반으로 직접 생성)
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

  const hour = new Date().getHours();
  const timeSentence =
    hour >= 22 || hour < 6
      ? '인적이 드문 시간대인 만큼, 주변을 살피며 이동하시길 권장합니다.'
      : '안심하고 이동하세요.';

  return [firstSentence, cctvSentence, lightsSentence, timeSentence]
    .filter(Boolean)
    .join(' ');
}


// ════════════════════════════════════════════════════════
// 4. 외부 인터페이스
// ════════════════════════════════════════════════════════

export async function getAiMessage(routeData) {
  const { routeType, safeScore, shortScore } = routeData;
  const firstSentence = buildFirstSentence(routeType, safeScore, shortScore);

  // ── 캐시 확인: 동일한 경로 데이터면 API 재호출 없이 반환 ──
  const cacheKey = buildCacheKey(routeData);
  if (aiMessageCache.has(cacheKey)) {
    console.log('[Gemini] 캐시 사용:', cacheKey);
    return aiMessageCache.get(cacheKey);
  }

  const prompt = buildPrompt(routeData, firstSentence);
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    // 429 rate limit: 폴백 반환 (캐시 저장 안 함 — 나중에 다시 시도할 수 있도록)
    if (res.status === 429) {
      console.warn('[Gemini] 429 rate limit → 폴백 사용');
      return buildFallback(routeData, firstSentence);
    }

    const data = await res.json();

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      console.warn('[Gemini] 응답 없음 → 폴백 사용');
      return buildFallback(routeData, firstSentence);
    }

    const message = data.candidates[0].content.parts[0].text.trim();

    // ── 성공한 응답만 캐시에 저장 ──
    aiMessageCache.set(cacheKey, message);

    return message;
  } catch (e) {
    console.error('[Gemini 오류]', e);
    return buildFallback(routeData, firstSentence);
  }
}