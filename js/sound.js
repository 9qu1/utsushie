// ウツシエ: 効果音（WebAudio で合成・音のファイルは使わない）
let ctx = null;
let mute = false;
try { mute = localStorage.getItem('us-mute') === '1'; } catch {}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// はじめて触ったときに音を出せるようにする（スマホは触るまで鳴らない）
window.addEventListener('pointerdown', () => { if (!mute) ac(); }, { once: true, capture: true });

function tone(freq, dur, { type = 'sine', vol = 0.12, at = 0, to = 0 } = {}) {
  if (mute) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tick() { tone(740, 0.09, { type: 'square', vol: 0.05 }); },
  count() { tone(660, 0.14, { type: 'triangle', vol: 0.12 }); },
  go() { tone(990, 0.3, { type: 'triangle', vol: 0.14 }); tone(1320, 0.3, { type: 'triangle', vol: 0.08, at: 0.06 }); },
  timeup() { tone(440, 0.18, { type: 'square', vol: 0.07 }); tone(330, 0.3, { type: 'square', vol: 0.07, at: 0.16 }); },
  done() { [660, 880, 1100].forEach((f, k) => tone(f, 0.16, { type: 'triangle', vol: 0.1, at: k * 0.07 })); },
  pop() { tone(520, 0.12, { type: 'sine', vol: 0.12, to: 900 }); },
  tap() { tone(1200, 0.05, { type: 'sine', vol: 0.06 }); },
  fanfare() { [523, 659, 784, 1047].forEach((f, k) => tone(f, k === 3 ? 0.5 : 0.14, { type: 'triangle', vol: 0.12, at: k * 0.11 })); },
  reel() { tone(1050, 0.03, { type: 'square', vol: 0.025 }); },
  ding() { tone(1568, 0.35, { type: 'triangle', vol: 0.12 }); tone(2093, 0.4, { type: 'sine', vol: 0.06, at: 0.02 }); },
  intro() { [392, 523, 659].forEach((f, k) => tone(f, 0.2, { type: 'triangle', vol: 0.1, at: k * 0.09 })); },
};

export const isMute = () => mute;
export function setMute(on) {
  mute = !!on;
  try { localStorage.setItem('us-mute', mute ? '1' : '0'); } catch {}
  if (!mute) ac();
}
