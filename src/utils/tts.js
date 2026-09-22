/**
 * tts.js
 * Web Speech API 기반 TTS 모듈
 */

let koVoice = null;

/**
 * 한국어 음성 초기화 — 음성 목록이 로드된 후 한 번만 실행
 * 'Google 한국의' 우선, 없으면 ko-KR 첫 번째
 */
function initVoice() {
  if (koVoice) return; // 이미 확정됐으면 재실행 안 함
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;

  // Edge 우선순위: 선히(자연스러운 여성) → Google 한국의(크롬) → ko-KR 기본값
  koVoice =
    voices.find((v) => v.name === 'Microsoft 선히 Online (Natural) - Korean (Korea)') ||
    voices.find((v) => v.name === 'Google 한국의') ||
    voices.find((v) => v.lang === 'ko-KR') ||
    null;
}

// 음성 목록 로드 완료 시 초기화
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    initVoice();
  };
  initVoice();
}

/**
 * 텍스트 발화
 * @param {string} text
 * @param {boolean} [silent=false] - true면 무음 발화
 * @param {Function} [onEnd] - 발화 완료 후 콜백
 */
export function speak(text, silent = false, onEnd = null) {
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }

  const doSpeak = () => {
    const utter = new SpeechSynthesisUtterance(silent ? ' ' : text);
    utter.lang   = 'ko-KR';
    utter.rate   = 1.0;
    utter.pitch  = 1.0;
    utter.volume = silent ? 0 : 1;

    if (!silent) {
      initVoice();
      if (koVoice) {
        utter.voice = koVoice;
      }
    }

    if (onEnd) {
      utter.onend = onEnd;
      utter.onerror = onEnd; // 오류 시에도 콜백 실행
    }

    window.speechSynthesis.speak(utter);
  };

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    setTimeout(doSpeak, 50);
  } else {
    doSpeak();
  }
}

/**
 * 발화 중단
 */
export function stopSpeak() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}