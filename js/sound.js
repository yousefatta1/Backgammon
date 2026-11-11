// Small synthesized sound effects, no audio files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('bg.muted') === '1'; } catch { /* storage off */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('bg.muted', v ? '1' : '0'); } catch { /* storage off */ }
}

function ac() {
  if (muted) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, dur, { type = 'sine', vol = 0.08, at = 0, slide = 0 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function click(at = 0, vol = 0.25, freq = 1800) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const len = Math.floor(a.sampleRate * 0.03);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  roll() { for (let i = 0; i < 6; i++) click(i * 0.06 + Math.random() * 0.02, 0.3, 1400 + Math.random() * 1200); },
  move() { tone(190, 0.09, { type: 'triangle', vol: 0.12, slide: 0.7 }); click(0, 0.18, 900); },
  tick() { click(0, 0.12, 2600); },
  pop() { tone(660, 0.12, { vol: 0.05, slide: 1.5 }); },
  turn() { tone(659, 0.18, { vol: 0.06 }); tone(880, 0.28, { vol: 0.06, at: 0.14 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { vol: 0.06, at: i * 0.11, type: 'triangle' })); },
};
