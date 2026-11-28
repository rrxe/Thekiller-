// Gold Rush sound effects — synthesised with WebAudio, so there are no audio files to ship or load.
// Respects the global mute switch from ./sfx. Every call is safe anywhere: it never throws.
//
// The mix goes through a compressor (punch) and a short cave-style echo, which is what gives the doors,
// the dynamite and the coins their "weight".
import { isMuted } from "./sfx";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;   // dry bus
let wet: GainNode | null = null;      // echo send
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (isMuted()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      const out = ctx.createGain(); out.gain.value = 0.8;
      comp.connect(out); out.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
      // cave echo: short feedback delay, darkened on every pass
      const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.13;
      const fb = ctx.createGain(); fb.gain.value = 0.28;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
      wet = ctx.createGain(); wet.gain.value = 0.22;
      wet.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(comp);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 1.5);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}

type Burst = { dur: number; freq: number; q?: number; vol: number; type?: BiquadFilterType; sweepTo?: number; attack?: number; echo?: number };
/** filtered noise: wood knocks, rumble, hiss, dust */
function burst(c: AudioContext, t: number, o: Burst) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.setValueAtTime(o.freq, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(master!);
  if (o.echo && wet) { const s = c.createGain(); s.gain.value = o.echo; g.connect(s); s.connect(wet); }
  src.start(t, Math.random() * 0.5, o.dur + 0.05);
}

type Tone = { freq: number; dur: number; vol: number; type?: OscillatorType; to?: number; attack?: number; echo?: number };
/** pitched tone with attack/decay: bells, sub drops, coin rings */
function tone(c: AudioContext, t: number, o: Tone) {
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g); g.connect(master!);
  if (o.echo && wet) { const s = c.createGain(); s.gain.value = o.echo; g.connect(s); s.connect(wet); }
  osc.start(t); osc.stop(t + o.dur + 0.05);
}

const run = (fn: (c: AudioContext, t: number) => void) => {
  const c = ac();
  if (!c) return;
  try { fn(c, c.currentTime + 0.005); } catch { /* ignore */ }
};

/** one metallic coin "tink": a bright triangle plus an inharmonic partial, like struck metal */
function coin(c: AudioContext, t: number, f: number, vol: number) {
  tone(c, t, { freq: f, dur: 0.32, vol, type: "triangle", echo: 0.5 });
  tone(c, t, { freq: f * 2.76, dur: 0.16, vol: vol * 0.45, type: "sine" });
  burst(c, t, { dur: 0.02, freq: 6000, q: 0.8, vol: vol * 0.35, type: "highpass" });
}

// rising pentatonic ladder: every gold you dig up sounds a little higher
const LADDER = [660, 740, 880, 988, 1175, 1319, 1480, 1760, 1976, 2349];

export const grSound = {
  /** bet placed / round starts: pickaxe "tink-tink" on rock + a soft thud */
  start: () => run((c, t) => {
    coin(c, t, 1318, 0.16); coin(c, t + 0.09, 1568, 0.14);
    burst(c, t + 0.2, { dur: 0.09, freq: 500, q: 0.7, vol: 0.28, type: "lowpass" });
  }),

  /** finger lands on a door: dull wooden knock */
  knock: () => run((c, t) => {
    tone(c, t, { freq: 190, to: 85, dur: 0.1, vol: 0.38, attack: 0.003 });
    burst(c, t, { dur: 0.06, freq: 900, q: 0.8, vol: 0.28, type: "lowpass" });
    tone(c, t + 0.075, { freq: 160, to: 80, dur: 0.08, vol: 0.2, attack: 0.003 });
  }),

  /** old hinge: a rising, wobbling saw through a narrow band-pass */
  creak: (delay = 0) => run((c, t0) => {
    const t = t0 + delay, dur = 0.5;
    const osc = c.createOscillator(); osc.type = "sawtooth";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(230, t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = 17;
    const lg = c.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(osc.frequency);
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 9;
    f.frequency.setValueAtTime(520, t); f.frequency.exponentialRampToValueAtTime(1100, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f); f.connect(g); g.connect(master!);
    if (wet) { const s = c.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(wet); }
    osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }),

  /** the heavy door reaches its stop: low thud */
  thud: (delay = 0) => run((c, t0) => {
    const t = t0 + delay;
    tone(c, t, { freq: 78, to: 38, dur: 0.34, vol: 0.55, attack: 0.004, echo: 0.25 });
    burst(c, t, { dur: 0.16, freq: 420, q: 0.6, vol: 0.34, type: "lowpass", echo: 0.2 });
  }),

  /** gold found; `step` (0…) climbs the scale */
  gold: (step = 0, delay = 0) => run((c, t0) => {
    const t = t0 + delay;
    const f = LADDER[Math.min(LADDER.length - 1, Math.max(0, step))];
    coin(c, t, f, 0.2);
    coin(c, t + 0.07, f * 1.5, 0.12);
    coin(c, t + 0.13, f * 1.25, 0.09);
  }),

  /** short rising shimmer for milestones (5x, 10x, 15x, 20x) */
  milestone: (level = 1) => run((c, t) => {
    const base = 523.25 * (1 + level * 0.06);
    [1, 1.25, 1.5, 2].forEach((m, i) => tone(c, t + i * 0.085, { freq: base * m, dur: 0.7, vol: 0.09, attack: 0.015, echo: 0.5 }));
  }),

  /** dynamite: sputtering fuse that runs out */
  fuse: (dur = 0.35) => run((c, t) => {
    for (let i = 0; i < 9; i++) {
      const at = t + (i / 9) * dur;
      burst(c, at, { dur: 0.05, freq: 4200 + Math.random() * 2500, q: 0.7, vol: 0.05 + Math.random() * 0.05, type: "highpass" });
    }
  }),

  /** BOOM: sub drop + crack + falling debris rumble */
  boom: () => run((c, t) => {
    tone(c, t, { freq: 105, to: 26, dur: 1.15, vol: 0.9, attack: 0.004, echo: 0.3 });
    burst(c, t, { dur: 0.05, freq: 3500, q: 0.7, vol: 0.7, type: "highpass" });
    burst(c, t, { dur: 0.9, freq: 2600, sweepTo: 110, q: 0.5, vol: 0.75, type: "lowpass", echo: 0.45 });
    burst(c, t + 0.08, { dur: 1.3, freq: 260, q: 0.4, vol: 0.3, type: "lowpass", attack: 0.12, echo: 0.4 });
    for (let i = 0; i < 6; i++) burst(c, t + 0.35 + i * 0.09 + Math.random() * 0.05, { dur: 0.03, freq: 2000 + Math.random() * 3000, q: 1, vol: 0.12, type: "bandpass" }); // falling rocks
  }),

  /** cash-out: a shower of coins landing + a warm bell chord (bigger win = longer shower) */
  cashout: (mult = 2) => run((c, t) => {
    const n = Math.min(22, 8 + Math.round(mult * 1.2));
    for (let i = 0; i < n; i++) {
      const f = LADDER[Math.floor(Math.random() * LADDER.length)] * (Math.random() < 0.3 ? 2 : 1);
      coin(c, t + i * (0.7 / n) + Math.random() * 0.03, f, 0.08 + Math.random() * 0.06);
    }
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, t + 0.08 + i * 0.07, { freq: f, dur: 1, vol: 0.085, attack: 0.02, echo: 0.55 }));
    burst(c, t, { dur: 0.25, freq: 600, q: 0.6, vol: 0.2, type: "lowpass" });
  }),

  /** doors sliding into place for the next step */
  whoosh: () => run((c, t) => {
    burst(c, t, { dur: 0.28, freq: 380, sweepTo: 1700, q: 0.9, vol: 0.09, attack: 0.1 });
    burst(c, t + 0.22, { dur: 0.1, freq: 500, q: 0.6, vol: 0.14, type: "lowpass" });
  }),

  /** payout counting up */
  tick: () => run((c, t) => { coin(c, t, 2600, 0.035); }),
};
