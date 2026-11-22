/**
 * WebAudio API Synthesizer for TradingView-style Price Alert Chime
 * Uses a singleton AudioContext unlocked on first user gesture so WebSocket-triggered
 * alerts are NEVER muted by browser autoplay policies.
 */

let sharedCtx: AudioContext | null = null;
let unlockInstalled = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {}
}

export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const onGesture = () => {
    unlockAudio();
  };
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture, { passive: true });
}

export function playAlertSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const triggerChime = () => {
      const now = ctx.currentTime + 0.02;
      // Distinct TradingView-style double chime (A5 -> D6 -> E6, repeated softly)
      const sequence: Array<{ freq: number; start: number; dur: number; vol: number }> = [
        { freq: 880.0, start: 0.0, dur: 0.24, vol: 0.34 },
        { freq: 1174.66, start: 0.13, dur: 0.26, vol: 0.36 },
        { freq: 1318.51, start: 0.26, dur: 0.36, vol: 0.38 },
        { freq: 1174.66, start: 0.62, dur: 0.22, vol: 0.26 },
        { freq: 1318.51, start: 0.76, dur: 0.4, vol: 0.32 },
      ];

      for (const n of sequence) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, now + n.start);

        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(triggerChime).catch(() => {});
    } else {
      triggerChime();
    }
  } catch {
    // Ignore audio errors
  }
}
