// Blackjack sound effects, synthesised with WebAudio (no audio files to ship).
// Respects the global mute switch from ./sfx. Every call is safe to make anywhere: it never throws.
import { isMuted } from "./sfx";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (isMuted()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.5);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}

/** filtered noise burst: card slide / flick / chip click */
function burst(c: AudioContext, t: number, o: { dur: number; freq: number; q?: number; vol: number; type?: BiquadFilterType; sweepTo?: number }) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.setValueAtTime(o.freq, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(master!);
  src.start(t, Math.random() * 0.2, o.dur + 0.05);
}

/** simple pitched tone with a soft attack/decay */
function tone(c: AudioContext, t: number, o: { freq: number; dur: number; vol: number; type?: OscillatorType; to?: number; attack?: number }) {
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = c.createGain();
  const a = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g); g.connect(master!);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}

const run = (fn: (c: AudioContext, t: number) => void) => {
  const c = ac();
  if (!c) return;
  try { fn(c, c.currentTime + 0.005); } catch { /* ignore */ }
};

/** soft paper "swish": noise with a gentle attack, band-passed and swept (card sliding on felt) */
function swish(c: AudioContext, t: number, o: { dur: number; f0: number; f1: number; vol: number; q?: number }) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = "bandpass"; f.Q.value = o.q ?? 0.7;
  f.frequency.setValueAtTime(o.f0, t);
  f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + o.dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(hp); hp.connect(g); g.connect(master!);
  src.start(t, Math.random() * 0.25, o.dur + 0.05);
}
/** tiny dry paper tap / snap */
function snap(c: AudioContext, t: number, vol: number, freq = 3200) {
  burst(c, t, { dur: 0.028, freq, q: 0.9, vol, type: "highpass" });
}
/** soft felt thud (card landing) */
function thud(c: AudioContext, t: number, vol: number) {
  burst(c, t, { dur: 0.06, freq: 700, q: 0.6, vol, type: "lowpass" });
}

export const bjSound = {
  /** a card slides across the felt and lands */
  deal: () => run((c, t) => {
    swish(c, t, { dur: 0.17, f0: 2200, f1: 3800, vol: 0.34 });
    thud(c, t + 0.15, 0.2);
    snap(c, t + 0.155, 0.1, 2600);
  }),
  /** a card is turned over: lift, flick, lay down */
  flip: () => run((c, t) => {
    swish(c, t, { dur: 0.1, f0: 1800, f1: 3400, vol: 0.26 });
    snap(c, t + 0.09, 0.2);
    thud(c, t + 0.14, 0.12);
  }),
  /** bet placed: soft felt tap (no pitched "ding") */
  chip: () => run((c, t) => {
    thud(c, t, 0.26); snap(c, t + 0.004, 0.12, 2400);
    thud(c, t + 0.07, 0.2); snap(c, t + 0.074, 0.1, 2800);
  }),
  /** button press: quiet paper tap */
  tap: () => run((c, t) => { snap(c, t, 0.16, 2800); thud(c, t + 0.01, 0.1); }),
  /** win: a quick paper "riffle" with a soft, low bell underneath */
  win: () => run((c, t) => {
    for (let i = 0; i < 5; i++) swish(c, t + i * 0.055, { dur: 0.08, f0: 2400, f1: 4200, vol: 0.2 });
    tone(c, t + 0.1, { freq: 784, dur: 0.5, vol: 0.07, type: "sine", attack: 0.02 });
    tone(c, t + 0.18, { freq: 1175, dur: 0.55, vol: 0.05, type: "sine", attack: 0.02 });
  }),
  /** blackjack: longer riffle + gentle chime */
  blackjack: () => run((c, t) => {
    for (let i = 0; i < 9; i++) swish(c, t + i * 0.05, { dur: 0.08, f0: 2200 + i * 160, f1: 4200, vol: 0.2 });
    [523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(c, t + 0.25 + i * 0.09, { freq: f, dur: 0.7, vol: 0.07, type: "sine", attack: 0.02 }));
  }),
  /** loss: just a soft felt thud and a slow slide, nothing harsh */
  lose: () => run((c, t) => {
    thud(c, t, 0.3);
    swish(c, t + 0.05, { dur: 0.22, f0: 3000, f1: 1200, vol: 0.14, q: 0.5 });
  }),
  /** bust: a slightly heavier thud */
  bust: () => run((c, t) => {
    thud(c, t, 0.42);
    tone(c, t, { freq: 110, to: 60, dur: 0.25, vol: 0.18, type: "sine", attack: 0.005 });
    swish(c, t + 0.06, { dur: 0.25, f0: 3000, f1: 1100, vol: 0.14, q: 0.5 });
  }),
  /** push / tie: two light taps */
  push: () => run((c, t) => { snap(c, t, 0.18); thud(c, t, 0.12); snap(c, t + 0.13, 0.18); thud(c, t + 0.13, 0.12); }),
  /** soft tick while the payout counts up */
  tick: (_step = 0) => run((c, t) => { snap(c, t, 0.07, 4000); }),
  /** (kept for compatibility) */
  suspense: () => run((c, t) => { swish(c, t, { dur: 0.3, f0: 1500, f1: 2600, vol: 0.12 }); }),
};
