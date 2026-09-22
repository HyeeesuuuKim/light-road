/**
 * sos.js
 * Web Audio API 기반 SOS 경보음 모듈
 * 파일 의존성 없이 JS로 사이렌 음 직접 생성
 */

let audioCtx   = null;
let oscillator = null;
let gainNode   = null;
let sweepTimer = null;
let isPlaying  = false;

// AudioContext 미리 생성 — 첫 경보 시 버벅거림 방지
function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // suspended 상태면 resume
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 경보음 시작 — 주파수가 880Hz ↔ 440Hz 사이를 0.6초 주기로 반복하는 사이렌
 */
export function startAlarm() {
  if (isPlaying) return;

  try {
    audioCtx   = getAudioCtx();
    gainNode   = audioCtx.createGain();
    gainNode.gain.value = 1.0;
    gainNode.connect(audioCtx.destination);

    oscillator = audioCtx.createOscillator();
    oscillator.type = 'sawtooth'; // 날카로운 경보음
    oscillator.connect(gainNode);
    oscillator.start();

    isPlaying = true;
    _sweep();
  } catch (e) {
    console.error('[SOS] 경보음 시작 실패:', e);
  }
}

/** 주파수 sweep — 880Hz → 440Hz → 880Hz 반복 */
function _sweep() {
  if (!isPlaying || !oscillator) return;

  const now = audioCtx.currentTime;
  oscillator.frequency.cancelScheduledValues(now);
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.linearRampToValueAtTime(440, now + 0.6);
  oscillator.frequency.linearRampToValueAtTime(880, now + 1.2);

  sweepTimer = setTimeout(_sweep, 1200);
}

/**
 * 경보음 중단
 */
export function stopAlarm() {
  if (!isPlaying) return;

  isPlaying = false;
  clearTimeout(sweepTimer);
  sweepTimer = null;

  try {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    // audioCtx는 닫지 않고 유지 — 다음 경보 시 재사용으로 버벅거림 방지
  } catch (e) {
    console.error('[SOS] 경보음 중단 실패:', e);
  }
}

/**
 * 단계별 차임벨 — 팝업 등장 시 사용자 알림용
 * 1차: sine  523Hz  단음       — 잔잔한 띵~
 * 2차: triangle 659Hz  2회     — 또렷한 띵띵~
 * 3차: sawtooth 880→1046Hz LFO — 긴박한 떨리는 사이렌
 *
 * PC 자동 재생 정책 대응: getAudioCtx() 재사용 + resume() 명시 호출
 */
export function playChime(stage = 1) {
  try {
    const ctx = getAudioCtx(); // 기존 AudioContext 재사용 — PC suspended 상태 방지

    const startTime = ctx.currentTime + 0.05; // 약간의 여유

    if (stage === 1) {
      // ── 1차: sine 단음 — 잔잔한 띵~ ──────────────────────────────
      const osc = ctx.createOscillator();
      const gn  = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 523;
      osc.connect(gn);
      gn.connect(ctx.destination);
      gn.gain.setValueAtTime(0, startTime);
      gn.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      osc.start(startTime);
      osc.stop(startTime + 0.5);

    } else if (stage === 2) {
      // ── 2차: triangle 2회 — 또렷한 띵띵~ ─────────────────────────
      [0, 0.3].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gn  = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 659;
        osc.connect(gn);
        gn.connect(ctx.destination);
        gn.gain.setValueAtTime(0, startTime + delay);
        gn.gain.linearRampToValueAtTime(0.45, startTime + delay + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.001, startTime + delay + 0.28);
        osc.start(startTime + delay);
        osc.stop(startTime + delay + 0.28);
      });

    } else {
      // ── 3차: sine 880Hz 3회 — 땡땡땡! 긴급 경보 스타일 ───────────
      [0, 0.22, 0.44].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gn  = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        osc.connect(gn);
        gn.connect(ctx.destination);

        const t = startTime + delay;
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(0.7, t + 0.015);  // 빠르게 최대 음량
        gn.gain.setValueAtTime(0.7, t + 0.13);            // 충분히 유지
        gn.gain.linearRampToValueAtTime(0, t + 0.18);     // 깔끔하게 차단

        osc.start(t);
        osc.stop(t + 0.18);
      });
    }
  } catch (e) {
    console.error('[SOS] 차임벨 실패:', e);
  }
}

/** 현재 경보음 재생 중 여부 */
export function isAlarmPlaying() {
  return isPlaying;
}