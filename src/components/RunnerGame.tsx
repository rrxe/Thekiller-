import { useEffect, useRef, useState } from "react";
import "../styles/game.css";
import UiIcons from "./UiIcons";
import { useLanguage } from "../i18n/LanguageContext";

type Props = {
  bestScore: number;
  onExit: (coinsEarned: number, score: number) => void;
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ObstacleKind = "crystal" | "barrier" | "drone";

type Obstacle = {
  x: number; // مركز العائق
  y: number;
  w: number;
  h: number;
  lane: number;
  kind: ObstacleKind;
  passed: boolean;
  phase: number;
};

type Star = { x: number; y: number; r: number; layer: number };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
};

type Sprite = { cv: HTMLCanvasElement; w: number; h: number; pad: number };

type Phase = "ready" | "active" | "over";

type SfxKind = "jump" | "land" | "left" | "right" | "near" | "milestone" | "start" | "hit";

type TgWebApp = {
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  HapticFeedback?: {
    impactOccurred?: (style: string) => void;
    notificationOccurred?: (type: string) => void;
  };
};

/* ------------------------------------------------------------------ */
/*  Tuning (كل الأرقام هنا لو حبيت تعدّل الإحساس)                      */
/* ------------------------------------------------------------------ */

const LANES = 3;
const BASE_SPEED_H = 0.48; // سرعة البداية = ارتفاع الشاشة × هذا الرقم بالثانية
const MAX_SPEED_H = 1.05; // أقصى سرعة
const RAMP_SECONDS = 116; // الوقت للوصول لأقصى سرعة (نفس النسخة القديمة)
const JUMP_DUR = 0.72; // زودنا مدة القفزة شوي عشان تحس فعلاً إنك طرت مسافة
const JUMP_SAFE_Z = 0.3; // خفّضناها عشان فترة الأمان فوق الحاجز تصير أطول وتوقيتها أسهل
const JUMP_BUFFER = 0.14; // لو ضغطت قفز قبل ما تنزل بشوي، ينحفظ
const SWIPE_PX = 16;
const TAP_MAX_MS = 320;
const MAX_STEP = 1 / 100;
const AIR_UNLOCK_SCORE = 16;
const DOUBLE_UNLOCK_SCORE = 24;
const WALL_UNLOCK_SCORE = 40;

const MUSIC_VOL = 0.5;
const SFX_VOL = 1;
const MUTE_KEY = "comet_run_muted";

const PARTICLE_COLORS = ["#cddcef", "#7cf0ff", "#ff9fd6", "#ffe27a"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function coinsForScore(score: number) {
  return Math.min(450, Math.floor(Math.max(0, score) / 4));
}

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function getTelegram(): TgWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

function roundRectPath(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/* ------------------------------------------------------------------ */
/*  Audio engine: مؤثرات مركّبة + موسيقى خلفية تتسارع مع اللعبة        */
/* ------------------------------------------------------------------ */

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = [
  { root: 45, tones: [57, 60, 64, 67] }, // Am
  { root: 41, tones: [57, 60, 65, 69] }, // F
  { root: 48, tones: [55, 60, 64, 67] }, // C
  { root: 43, tones: [55, 59, 62, 67] }, // G
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 3, 2];

function createAudio() {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let musicFilter: BiquadFilterNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = readMuted();

  let timer: ReturnType<typeof setInterval> | null = null;
  let playing = false;
  let nextTime = 0;
  let step = 0;
  let bpm = 110;

  const ensure = () => {
    if (ac) return ac;
    const Ctor =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    try {
      ac = new Ctor({ latencyHint: "interactive" });
    } catch {
      ac = new Ctor();
    }

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;

    master = ac.createGain();
    master.gain.value = muted ? 0 : 1;

    sfxBus = ac.createGain();
    sfxBus.gain.value = SFX_VOL;

    musicFilter = ac.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 1800;

    musicBus = ac.createGain();
    musicBus.gain.value = 0;

    sfxBus.connect(comp);
    musicBus.connect(musicFilter);
    musicFilter.connect(comp);
    comp.connect(master);
    master.connect(ac.destination);

    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    return ac;
  };

  // لازم يتنادى مباشرة داخل حركة لمس/ضغط من المستخدم (شرط iOS و Telegram)
  const unlock = () => {
    const c = ensure();
    if (c && c.state === "suspended") void c.resume();
  };

  const env = (g: AudioParam, t0: number, peak: number, atk: number, dur: number) => {
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + atk);
    g.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, atk + 0.01));
  };

  const blip = (
    at: number,
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    bus?: GainNode | null
  ) => {
    const c = ac;
    const out = bus ?? sfxBus;
    if (!c || !out) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    env(g.gain, at, vol, 0.006, dur);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
  };

  const noise = (
    at: number,
    dur: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    vol: number,
    bus?: GainNode | null
  ) => {
    const c = ac;
    const out = bus ?? sfxBus;
    if (!c || !out || !noiseBuf) return;
    const src = c.createBufferSource();
    const flt = c.createBiquadFilter();
    const g = c.createGain();
    src.buffer = noiseBuf;
    flt.type = type;
    flt.Q.value = 1.1;
    flt.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
    env(g.gain, at, vol, 0.005, dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(out);
    src.start(at, Math.random() * 0.4);
    src.stop(at + dur + 0.05);
  };

  const sfx = (kind: SfxKind) => {
    const c = ac;
    if (!c || muted) return;
    const now = c.currentTime;

    switch (kind) {
      case "jump":
        blip(now, 300, 840, 0.17, "triangle", 0.2);
        noise(now, 0.14, "bandpass", 900, 2800, 0.05);
        break;
      case "land":
        blip(now, 160, 60, 0.1, "sine", 0.24);
        noise(now, 0.06, "lowpass", 1200, 300, 0.07);
        break;
      case "left":
        blip(now, 640, 470, 0.06, "triangle", 0.08);
        break;
      case "right":
        blip(now, 470, 640, 0.06, "triangle", 0.08);
        break;
      case "near":
        noise(now, 0.2, "bandpass", 600, 2400, 0.05);
        break;
      case "milestone":
        blip(now, 660, 660, 0.16, "triangle", 0.12);
        blip(now + 0.07, 880, 880, 0.16, "triangle", 0.12);
        blip(now + 0.14, 1320, 1320, 0.2, "triangle", 0.12);
        blip(now + 0.21, 1760, 1760, 0.3, "sine", 0.05);
        break;
      case "start":
        blip(now, 220, 880, 0.3, "sawtooth", 0.06);
        blip(now + 0.1, 440, 1320, 0.25, "triangle", 0.07);
        break;
      case "hit":
        noise(now, 0.55, "lowpass", 2600, 120, 0.5);
        blip(now, 200, 38, 0.5, "sawtooth", 0.26);
        blip(now, 90, 30, 0.6, "sine", 0.4);
        break;
    }
  };

  const scheduleStep = (i: number, at: number) => {
    const bus = musicBus;
    if (!bus) return;
    const pos = i % 16;
    const chord = CHORDS[Math.floor(i / 16) % CHORDS.length];
    const stepDur = 60 / bpm / 4;

    if (pos % 4 === 0) blip(at, 150, 45, 0.14, "sine", 0.45, bus);
    if (pos === 4 || pos === 12) {
      noise(at, 0.13, "bandpass", 1800, 1800, 0.14, bus);
      blip(at, 220, 140, 0.08, "triangle", 0.07, bus);
    }
    noise(at, 0.035, "highpass", 7000, 7000, pos % 2 === 0 ? 0.03 : 0.012, bus);
    if (pos % 2 === 0) {
      const oct = pos % 8 === 6 ? 12 : 0;
      blip(at, mtof(chord.root + oct), mtof(chord.root + oct), stepDur * 1.7, "sawtooth", 0.11, bus);
    }
    blip(at, mtof(chord.tones[ARP[pos]] + 12), mtof(chord.tones[ARP[pos]] + 12), stepDur * 0.9, "square", 0.03, bus);
  };

  const tick = () => {
    const c = ac;
    if (!c || !playing) return;
    const stepDur = 60 / bpm / 4;
    while (nextTime < c.currentTime + 0.14) {
      scheduleStep(step, nextTime);
      nextTime += stepDur;
      step += 1;
    }
  };

  const startMusic = () => {
    const c = ensure();
    if (!c || !musicBus || playing) return;
    playing = true;
    step = 0;
    nextTime = c.currentTime + 0.06;
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.setTargetAtTime(MUSIC_VOL, c.currentTime, 0.08);
    timer = setInterval(tick, 30);
  };

  const stopMusic = (fade = 0.5) => {
    playing = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (ac && musicBus) {
      musicBus.gain.cancelScheduledValues(ac.currentTime);
      musicBus.gain.setTargetAtTime(0, ac.currentTime, fade / 3);
    }
  };

  // p من 0 إلى 1: كل ما زادت السرعة يتسارع الإيقاع وينفتح الصوت
  const setIntensity = (p: number) => {
    bpm = 110 + p * 36;
    if (ac && musicFilter) musicFilter.frequency.setTargetAtTime(1800 + p * 3400, ac.currentTime, 0.3);
  };

  const toggleMute = () => {
    muted = !muted;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (ac && master) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.02);
    return muted;
  };

  const suspend = () => {
    if (ac && ac.state === "running") void ac.suspend();
  };

  const resume = () => {
    if (ac && ac.state === "suspended") void ac.resume();
  };

  const dispose = () => {
    stopMusic(0.05);
    if (ac) {
      void ac.close().catch(() => {});
      ac = null;
    }
  };

  return { unlock, sfx, startMusic, stopMusic, setIntensity, toggleMute, suspend, resume, dispose };
}

type AudioEngine = ReturnType<typeof createAudio>;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RunnerGame({ bestScore, onExit }: Props) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreElRef = useRef<HTMLElement>(null);
  const bestElRef = useRef<HTMLElement>(null);
  const scoreRef = useRef(0);
  const audioRef = useRef<AudioEngine | null>(null);
  const tRef = useRef(t);

  const initialBest = Math.max(0, Math.floor(bestScore || 0));

  const [ready, setReady] = useState(true);
  const [muted, setMuted] = useState<boolean>(() => readMuted());
  const [result, setResult] = useState<null | {
    score: number;
    coins: number;
    isNewBest: boolean;
  }>(null);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // alpha:false = المتصفح ما يحتاج يمزج الكانفس مع اللي وراه، تركيب أسرع
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const audio = createAudio();
    audioRef.current = audio;

    const tg = getTelegram();
    // بدون هذا سحب الإصبع للأسفل/الأعلى داخل تيليجرام ممكن يصغّر التطبيق
    tg?.disableVerticalSwipes?.();

    const s = {
      W: 0,
      H: 0,
      dpr: 1,
      trackW: 0,
      trackX: 0,
      laneW: 0,
      py: 0,
      pw: 0,
      ph: 0,
      baseSpeed: 0,
      maxSpeed: 0,

      phase: "ready" as Phase,
      paused: false,
      elapsed: 0,
      speed: 0,
      scrollSpeed: 0,
      scroll: 0,
      score: 0,
      scoreInt: 0,
      bestShown: initialBest,
      time: 0,

      lane: 1,
      px: 0,
      jumpT: -1,
      z: 0,
      jumpBuffer: 0,

      rowDist: 0,
      nextGap: 0,
      intensityStep: -1,

      obstacles: [] as Obstacle[],
      stars: [] as Star[],
      particles: Array.from({ length: 96 }, () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 2,
        color: 0,
      })) as Particle[],
      pIdx: 0,
      trailTimer: 0,

      shake: 0,
      flash: 0,
      milestoneFlash: 0,
      milestoneText: "",
      lastNear: -1,
    };

    const art = {
      bg: null as HTMLCanvasElement | null,
      fog: null as HTMLCanvasElement | null,
      player: null as Sprite | null,
      crystal: null as Sprite | null,
      barrier: null as Sprite | null,
      drone: null as Sprite | null,
    };

    let resultTimer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let last = 0;

    const laneX = (lane: number) => s.trackX + s.laneW * (lane + 0.5);

    /* ---------------- feedback ---------------- */

    const haptic = (kind: "light" | "error") => {
      const h = tg?.HapticFeedback;
      if (h) {
        if (kind === "error") h.notificationOccurred?.("error");
        else h.impactOccurred?.("light");
        return;
      }
      if (navigator.vibrate) navigator.vibrate(kind === "error" ? [90, 40, 90] : 8);
    };

    const emit = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      life: number,
      size: number,
      color: number
    ) => {
      const p = s.particles[s.pIdx];
      s.pIdx = (s.pIdx + 1) % s.particles.length;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.max = life;
      p.size = size;
      p.color = color;
    };

    /* ---------------- assets (تنرسم مرة وحدة، مو كل فريم) ---------------- */

    const makeCanvas = (w: number, h: number) => {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.ceil(w * s.dpr));
      cv.height = Math.max(1, Math.ceil(h * s.dpr));
      const c = cv.getContext("2d") as CanvasRenderingContext2D;
      c.scale(s.dpr, s.dpr);
      return { cv, c };
    };

    const makeSprite = (
      w: number,
      h: number,
      pad: number,
      draw: (c: CanvasRenderingContext2D, w: number, h: number) => void
    ): Sprite => {
      const { cv, c } = makeCanvas(w + pad * 2, h + pad * 2);
      c.translate(pad, pad);
      draw(c, w, h);
      return { cv, w, h, pad };
    };

    const buildSprites = () => {
      const lw = s.laneW;
      s.pw = lw * 0.4;
      s.ph = lw * 0.52;

      art.player = makeSprite(s.pw, s.ph, 18, (c, w, h) => {
        const grad = c.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#e2fbff");
        grad.addColorStop(0.45, "#7cf0ff");
        grad.addColorStop(1, "#4a8cff");
        c.fillStyle = grad;
        c.shadowColor = "rgba(124,240,255,.75)";
        c.shadowBlur = 14;
        c.beginPath();
        c.moveTo(w / 2, 0);
        c.bezierCurveTo(w * 1.05, h * 0.28, w * 1.0, h * 0.8, w / 2, h);
        c.bezierCurveTo(0, h * 0.8, -w * 0.05, h * 0.28, w / 2, 0);
        c.closePath();
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = "rgba(10,20,40,.6)";
        c.beginPath();
        c.ellipse(w / 2, h * 0.36, w * 0.17, h * 0.12, 0, 0, Math.PI * 2);
        c.fill();
      });

      art.crystal = makeSprite(lw * 0.5, lw * 0.72, 16, (c, w, h) => {
        const grad = c.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#ffd0a0");
        grad.addColorStop(1, "#ff6b4a");
        c.fillStyle = grad;
        c.shadowColor = "rgba(255,120,80,.65)";
        c.shadowBlur = 12;
        c.beginPath();
        c.moveTo(w / 2, 0);
        c.lineTo(w, h * 0.45);
        c.lineTo(w / 2, h);
        c.lineTo(0, h * 0.45);
        c.closePath();
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = "rgba(120,20,10,.28)";
        c.beginPath();
        c.moveTo(w / 2, 0);
        c.lineTo(w / 2, h);
        c.lineTo(0, h * 0.45);
        c.closePath();
        c.fill();
      });

      art.barrier = makeSprite(lw * 0.88, lw * 0.3, 16, (c, w, h) => {
        const grad = c.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#ff7ad0");
        grad.addColorStop(1, "#8a4dff");
        c.fillStyle = grad;
        c.shadowColor = "rgba(255,110,210,.65)";
        c.shadowBlur = 12;
        roundRectPath(c, 0, 0, w, h, h * 0.4);
        c.fill();
        c.shadowBlur = 0;
        c.save();
        roundRectPath(c, 0, 0, w, h, h * 0.4);
        c.clip();
        c.strokeStyle = "rgba(255,255,255,.28)";
        c.lineWidth = h * 0.22;
        for (let x = -h; x < w + h; x += h * 0.9) {
          c.beginPath();
          c.moveTo(x, h);
          c.lineTo(x + h, 0);
          c.stroke();
        }
        c.restore();
      });

      art.drone = makeSprite(lw * 0.5, lw * 0.36, 16, (c, w, h) => {
        c.fillStyle = "#ff9fd6";
        c.shadowColor = "rgba(255,120,200,.75)";
        c.shadowBlur = 14;
        c.beginPath();
        c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = "rgba(60,10,50,.6)";
        c.beginPath();
        c.arc(w / 2, h / 2, h * 0.2, 0, Math.PI * 2);
        c.fill();
      });
    };

    const buildBackground = () => {
      const { cv, c } = makeCanvas(s.W, s.H);
      const g = c.createLinearGradient(0, 0, 0, s.H);
      g.addColorStop(0, "#120a26");
      g.addColorStop(0.55, "#0a0718");
      g.addColorStop(1, "#04030c");
      c.fillStyle = g;
      c.fillRect(0, 0, s.W, s.H);

      const rg = c.createRadialGradient(s.W / 2, s.H * 0.9, 0, s.W / 2, s.H * 0.9, s.H * 0.7);
      rg.addColorStop(0, "rgba(120,80,255,.18)");
      rg.addColorStop(1, "rgba(120,80,255,0)");
      c.fillStyle = rg;
      c.fillRect(0, 0, s.W, s.H);

      c.fillStyle = "rgba(22,14,48,.8)";
      c.fillRect(s.trackX, 0, s.trackW, s.H);

      c.save();
      c.strokeStyle = "rgba(154,110,255,.85)";
      c.lineWidth = 2;
      c.shadowColor = "rgba(154,110,255,.9)";
      c.shadowBlur = 12;
      c.beginPath();
      c.moveTo(s.trackX, 0);
      c.lineTo(s.trackX, s.H);
      c.moveTo(s.trackX + s.trackW, 0);
      c.lineTo(s.trackX + s.trackW, s.H);
      c.stroke();
      c.restore();

      art.bg = cv;

      // ضباب أعلى الشاشة: العوائق تظهر منه تدريجياً بدل ما "تنط" فجأة
      const fogH = Math.ceil(s.H * 0.26);
      const fog = makeCanvas(s.W, fogH);
      const fg = fog.c.createLinearGradient(0, 0, 0, fogH);
      fg.addColorStop(0, "rgba(18,10,38,1)");
      fg.addColorStop(1, "rgba(18,10,38,0)");
      fog.c.fillStyle = fg;
      fog.c.fillRect(0, 0, s.W, fogH);
      art.fog = fog.cv;
    };

    const makeStars = () =>
      Array.from({ length: 60 }, () => ({
        x: Math.random() * s.W,
        y: Math.random() * s.H,
        r: 0.6 + Math.random() * 1.1,
        layer: Math.random() < 0.5 ? 0 : 1,
      }));

    const resize = () => {
      const parent = canvas.parentElement;
      const W = parent?.clientWidth || window.innerWidth;
      const H = parent?.clientHeight || window.innerHeight;
      // سقف 2 لأن dpr=3 يعني ضعف البكسلات تقريباً بدون فرق واضح، ويكسر الـ60fps
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (W === s.W && H === s.H && dpr === s.dpr) return;

      s.W = W;
      s.H = H;
      s.dpr = dpr;

      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      s.trackW = Math.min(W - 16, 440);
      s.laneW = s.trackW / LANES;
      s.trackX = (W - s.trackW) / 2;
      s.py = H * 0.76;
      s.baseSpeed = H * BASE_SPEED_H;
      s.maxSpeed = H * MAX_SPEED_H;
      if (s.phase === "ready") s.speed = s.baseSpeed;

      buildSprites();
      buildBackground();
      if (s.stars.length === 0) s.stars = makeStars();

      s.px = laneX(s.lane);
      for (const ob of s.obstacles) ob.x = laneX(ob.lane);
    };

    /* ---------------- game logic ---------------- */

    const pushObstacle = (kind: ObstacleKind, lane: number, overshoot: number) => {
      const lw = s.laneW;
      let w = lw * 0.5;
      let h = lw * 0.72 * (0.9 + Math.random() * 0.25);
      if (kind === "barrier") {
        w = lw * 0.88;
        h = lw * 0.3;
      } else if (kind === "drone") {
        w = lw * 0.5;
        h = lw * 0.36;
      }
      s.obstacles.push({
        x: laneX(lane),
        y: -h / 2 - 8 - overshoot,
        w,
        h,
        lane,
        kind,
        passed: false,
        phase: Math.random() * Math.PI * 2,
      });
    };

    const spawnRow = (overshoot: number) => {
      const sc = s.score;
      const options = ["crystal", "crystal", "barrier"];
      if (sc >= AIR_UNLOCK_SCORE) options.push("drone");
      if (sc >= DOUBLE_UNLOCK_SCORE) options.push("double", "double");
      if (sc >= WALL_UNLOCK_SCORE) options.push("wall");

      const pick = options[(Math.random() * options.length) | 0];
      const lane = (Math.random() * LANES) | 0;
      let heavy = false;

      if (pick === "crystal") pushObstacle("crystal", lane, overshoot);
      else if (pick === "barrier") pushObstacle("barrier", lane, overshoot);
      else if (pick === "drone") pushObstacle("drone", lane, overshoot);
      else if (pick === "double") {
        // دايماً يبقى مسار واحد فاضي عشان اللعبة عادلة
        const freeLane = (Math.random() * LANES) | 0;
        for (let l = 0; l < LANES; l += 1) {
          if (l === freeLane) continue;
          pushObstacle(Math.random() < 0.7 ? "crystal" : "barrier", l, overshoot);
        }
        heavy = true;
      } else {
        // جدار حواجز على كل المسارات: لازم تقفز
        for (let l = 0; l < LANES; l += 1) pushObstacle("barrier", l, overshoot);
        heavy = true;
      }

      // المسافة للصف الجاي تُحسب بالسرعة، فيبقى الوقت المتاح للتفادي عادل حتى لو زادت السرعة
      const progress = clamp((s.speed - s.baseSpeed) / (s.maxSpeed - s.baseSpeed), 0, 1);
      const factor = lerp(1.0, 0.7, progress) * (0.92 + Math.random() * 0.28) + (heavy ? 0.15 : 0);
      s.nextGap = s.speed * factor;
    };

    const startJump = () => {
      s.jumpT = 0;
      s.jumpBuffer = 0;
      audio.sfx("jump");
      haptic("light");
      for (let i = 0; i < 4; i += 1) {
        emit(s.px, s.py + s.ph * 0.4, (Math.random() - 0.5) * 90, 60 + Math.random() * 60, 0.3, 2.5, 0);
      }
    };

    const doJump = () => {
      if (s.phase !== "active" || s.paused) return;
      if (s.jumpT >= 0) {
        s.jumpBuffer = JUMP_BUFFER;
        return;
      }
      startJump();
    };

    const moveLane = (dir: number) => {
      if (s.phase !== "active" || s.paused) return;
      const target = clamp(s.lane + dir, 0, LANES - 1);
      if (target === s.lane) return;
      s.lane = target;
      audio.sfx(dir < 0 ? "left" : "right");
      for (let i = 0; i < 3; i += 1) {
        emit(s.px, s.py + s.ph * 0.3, -dir * (40 + Math.random() * 60), 30 + Math.random() * 50, 0.25, 2.5, 1);
      }
    };

    const startRun = () => {
      if (s.phase !== "ready") return;
      s.phase = "active";
      s.rowDist = 0;
      s.nextGap = s.H * 0.35;
      setReady(false);
      audio.sfx("start");
      audio.startMusic();
    };

    const pauseRun = () => {
      if (s.phase !== "active" || s.paused) return;
      s.paused = true;
      audio.suspend();
    };

    const resumeRun = () => {
      if (!s.paused) return;
      s.paused = false;
      last = 0;
      audio.resume();
    };

    const finishRun = () => {
      if (s.phase !== "active") return;
      s.phase = "over";
      s.shake = 0.38;
      s.flash = 1;
      audio.sfx("hit");
      audio.stopMusic(0.6);
      haptic("error");

      for (let i = 0; i < 28; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 260;
        emit(s.px, s.py, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, 2 + Math.random() * 3, i % 2 ? 1 : 2);
      }

      const finalScore = Math.floor(s.score);
      const coinsEarned = coinsForScore(finalScore);
      const isNewBest = finalScore > initialBest;
      scoreRef.current = finalScore;
      s.scoreInt = finalScore;
      if (scoreElRef.current) scoreElRef.current.textContent = String(finalScore);
      if (finalScore > s.bestShown) {
        s.bestShown = finalScore;
        if (bestElRef.current) bestElRef.current.textContent = String(finalScore);
      }

      // نأخر ظهور البطاقة نص ثانية عشان اللاعب يشوف الاصطدام
      resultTimer = setTimeout(() => {
        setResult({ score: finalScore, coins: coinsEarned, isNewBest });
      }, 500);
    };

    const collide = (ob: Obstacle) => {
      const pw = s.pw * 0.62;
      const ph = s.ph * 0.66;
      const pl = s.px - pw / 2;
      const pt = s.py - ph / 2;

      let hw = ob.w;
      let hh = ob.h;
      if (ob.kind === "crystal") {
        hw *= 0.6;
        hh *= 0.78;
      } else if (ob.kind === "barrier") {
        if (s.z > JUMP_SAFE_Z) return false;
        hw *= 0.94;
        hh *= 0.85;
      } else {
        hw *= 0.66;
        hh *= 0.66;
      }

      return (
        pl < ob.x + hw / 2 && pl + pw > ob.x - hw / 2 && pt < ob.y + hh / 2 && pt + ph > ob.y - hh / 2
      );
    };

    const update = (dt: number) => {
      s.time += dt;
      if (s.milestoneFlash > 0) s.milestoneFlash = Math.max(0, s.milestoneFlash - dt * 1.6);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 3);
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);

      // الجسيمات
      for (const p of s.particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // سرعة تمرير العالم: تتأقلم بنعومة بين الانتظار/اللعب/الخسارة
      const target =
        s.phase === "active" ? s.speed : s.phase === "ready" ? s.baseSpeed * 0.4 : 0;
      s.scrollSpeed += (target - s.scrollSpeed) * (1 - Math.exp(-dt * 5));
      s.scroll += s.scrollSpeed * dt;

      for (const star of s.stars) {
        star.y += (s.scrollSpeed * (star.layer ? 0.12 : 0.05) + 8) * dt;
        if (star.y > s.H + 4) {
          star.y = -4;
          star.x = Math.random() * s.W;
        }
      }

      // اللاعب ينزلق للمسار بشكل مستقل عن الفريمات (نفس الإحساس على 60 و 120 هرتز)
      const tx = laneX(s.lane);
      s.px += (tx - s.px) * (1 - Math.exp(-dt * 20));

      if (s.phase !== "active") return;

      s.elapsed += dt;
      const progress = clamp(s.elapsed / RAMP_SECONDS, 0, 1);
      s.speed = lerp(s.baseSpeed, s.maxSpeed, progress);

      // نفس اقتصاد النقاط القديم (6.6 → 20 نقطة بالثانية)
      const rate = 6.6 + progress * 13.4;
      const prevMilestone = Math.floor(s.score / 100);
      s.score += dt * rate;
      const currMilestone = Math.floor(s.score / 100);
      if (currMilestone > prevMilestone && currMilestone > 0) {
        s.milestoneFlash = 1;
        s.milestoneText = tRef.current("runnerGame.milestone", { n: currMilestone * 100 });
        audio.sfx("milestone");
      }

      const stepIdx = Math.floor(progress * 20);
      if (stepIdx !== s.intensityStep) {
        s.intensityStep = stepIdx;
        audio.setIntensity(progress);
      }

      // القفز
      if (s.jumpT >= 0) {
        s.jumpT += dt;
        if (s.jumpT >= JUMP_DUR) {
          s.jumpT = -1;
          s.z = 0;
          audio.sfx("land");
          for (let i = 0; i < 4; i += 1) {
            emit(s.px, s.py + s.ph * 0.4, (Math.random() - 0.5) * 120, 40 + Math.random() * 50, 0.3, 2.5, 0);
          }
          if (s.jumpBuffer > 0) startJump();
        } else {
          // منحنى فيه "تعليق" بالهواء: يطلع بسرعة، يضل بالقمة فترة كافية، وينزل بسرعة
          // (بدل منحنى الجرس اللي يفوت بالقمة لحظة وحدة ويصعب توقيته)
          const jp = clamp(s.jumpT / JUMP_DUR, 0, 1);
          const RISE = 0.3;
          const FALL = 0.3;
          if (jp < RISE) {
            const rt = jp / RISE;
            s.z = rt * rt * (3 - 2 * rt);
          } else if (jp > 1 - FALL) {
            const ft = (1 - jp) / FALL;
            s.z = ft * ft * (3 - 2 * ft);
          } else {
            s.z = 1;
          }
        }
      }
      if (s.jumpBuffer > 0) s.jumpBuffer -= dt;

      // ذيل خلف اللاعب
      s.trailTimer -= dt;
      if (s.trailTimer <= 0) {
        s.trailTimer = 0.03;
        emit(
          s.px + (Math.random() - 0.5) * s.pw * 0.5,
          s.py + s.ph * 0.45,
          (Math.random() - 0.5) * 20,
          s.speed * 0.35,
          0.32,
          2 + Math.random() * 2,
          1
        );
      }

      // توليد الصفوف حسب المسافة
      s.rowDist += s.speed * dt;
      while (s.rowDist >= s.nextGap) {
        const overshoot = s.rowDist - s.nextGap;
        s.rowDist -= s.nextGap;
        spawnRow(overshoot);
      }

      // تحريك العوائق + التصادم (بدون filter عشان ما نولّد garbage كل فريم)
      let hit = false;
      let w = 0;
      const obs = s.obstacles;
      for (let i = 0; i < obs.length; i += 1) {
        const ob = obs[i];
        ob.y += s.speed * dt;

        if (ob.kind === "drone") {
          ob.phase += dt * 3.2;
          ob.x = laneX(ob.lane) + Math.sin(ob.phase) * s.laneW * 0.22;
        }

        if (!hit && collide(ob)) hit = true;

        if (!ob.passed && ob.y - ob.h / 2 > s.py + s.ph / 2) {
          ob.passed = true;
          if (
            ob.kind !== "barrier" &&
            Math.abs(ob.x - s.px) < s.laneW * 0.8 &&
            s.time - s.lastNear > 0.25
          ) {
            s.lastNear = s.time;
            audio.sfx("near");
          }
        }

        if (ob.y - ob.h / 2 < s.H + 40) obs[w++] = ob;
      }
      obs.length = w;

      if (hit) {
        finishRun();
        return;
      }

      const si = Math.floor(s.score);
      if (si !== s.scoreInt) {
        s.scoreInt = si;
        scoreRef.current = si;
        if (scoreElRef.current) scoreElRef.current.textContent = String(si);
        if (si > s.bestShown) {
          s.bestShown = si;
          if (bestElRef.current) bestElRef.current.textContent = String(si);
        }
      }
    };

    /* ---------------- drawing ---------------- */

    const drawSprite = (sp: Sprite | null, cx: number, cy: number, w: number, h: number) => {
      if (!sp) return;
      const kx = w / sp.w;
      const ky = h / sp.h;
      const dw = (sp.w + sp.pad * 2) * kx;
      const dh = (sp.h + sp.pad * 2) * ky;
      ctx.drawImage(sp.cv, cx - dw / 2, cy - dh / 2, dw, dh);
    };

    const fitText = (text: string, maxWidth: number, weight: string, size: number) => {
      let px = size;
      ctx.font = `${weight} ${px}px Inter, system-ui, sans-serif`;
      while (px > 9 && ctx.measureText(text).width > maxWidth) {
        px -= 0.5;
        ctx.font = `${weight} ${px}px Inter, system-ui, sans-serif`;
      }
    };

    const drawPrompt = (title: string, sub: string) => {
      const boxW = Math.min(s.W - 32, 340);
      const boxH = sub ? 96 : 64;
      const boxX = (s.W - boxW) / 2;
      const boxY = s.H * 0.26;

      ctx.fillStyle = "rgba(10,8,20,.74)";
      ctx.strokeStyle = "rgba(154,110,255,.35)";
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, boxX, boxY, boxW, boxH, 22);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f1e9ff";
      fitText(title, boxW - 28, "700", 17);
      ctx.fillText(title, s.W / 2, boxY + (sub ? 34 : boxH / 2));

      if (sub) {
        ctx.fillStyle = "#b9a8e0";
        fitText(sub, boxW - 28, "600", 12.5);
        ctx.fillText(sub, s.W / 2, boxY + 62);
      }
    };

    const draw = () => {
      if (!art.bg) return;
      ctx.drawImage(art.bg, 0, 0, s.W, s.H);

      // نجوم (دفعة وحدة لكل طبقة)
      const streak = Math.min(s.scrollSpeed * 0.012, 12);
      ctx.fillStyle = "rgba(231,220,255,.35)";
      for (const st of s.stars) if (st.layer === 0) ctx.fillRect(st.x, st.y, st.r, st.r + streak * 0.5);
      ctx.fillStyle = "rgba(231,220,255,.65)";
      for (const st of s.stars) if (st.layer === 1) ctx.fillRect(st.x, st.y, st.r, st.r + streak);

      // شبكة المسار + خطوط الفصل تعطي إحساس السرعة
      const gs = s.laneW * 0.9;
      const off = s.scroll % gs;
      ctx.strokeStyle = "rgba(154,110,255,.11)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = off - gs; y < s.H; y += gs) {
        ctx.moveTo(s.trackX, y);
        ctx.lineTo(s.trackX + s.trackW, y);
      }
      ctx.stroke();

      const dash = 26;
      ctx.strokeStyle = "rgba(154,110,255,.38)";
      ctx.lineWidth = 2;
      ctx.setLineDash([dash, dash]);
      ctx.lineDashOffset = -(s.scroll % (dash * 2));
      ctx.beginPath();
      for (let l = 1; l < LANES; l += 1) {
        const x = s.trackX + s.laneW * l;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, s.H);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // العالم (مع الاهتزاز)
      const shaking = s.shake > 0;
      if (shaking) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * 9 * s.shake, (Math.random() - 0.5) * 9 * s.shake);
      }

      for (const ob of s.obstacles) {
        if (ob.kind === "crystal") {
          drawSprite(art.crystal, ob.x, ob.y, ob.w, ob.h);
        } else if (ob.kind === "barrier") {
          drawSprite(art.barrier, ob.x, ob.y, ob.w, ob.h);
        } else {
          drawSprite(art.drone, ob.x, ob.y, ob.w, ob.h);
          ctx.save();
          ctx.translate(ob.x, ob.y);
          ctx.rotate(ob.phase * 3);
          ctx.strokeStyle = "rgba(255,255,255,.85)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-ob.w * 0.75, 0);
          ctx.lineTo(ob.w * 0.75, 0);
          ctx.stroke();
          ctx.restore();
        }
      }

      // الجسيمات
      for (const p of s.particles) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.75;
        ctx.fillStyle = PARTICLE_COLORS[p.color];
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // اللاعب: القفز = تكبير + ظل يبعد (إحساس ارتفاع). عند الخسارة يختفي ويتحول لانفجار
      if (s.phase !== "over") {
        const lift = s.z * s.laneW * 0.42;
        const scale = 1 + s.z * 0.28;

        ctx.globalAlpha = 0.38 - s.z * 0.18;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(s.px, s.py + s.ph * 0.22, s.pw * 0.5 * (1 - s.z * 0.25), s.pw * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        const tilt = clamp((laneX(s.lane) - s.px) / s.laneW, -1, 1) * 0.3;
        ctx.save();
        ctx.translate(s.px, s.py - lift);
        ctx.rotate(tilt);
        drawSprite(art.player, 0, 0, s.pw * scale, s.ph * scale);
        ctx.restore();
      }

      if (shaking) ctx.restore();

      if (art.fog) ctx.drawImage(art.fog, 0, 0, s.W, Math.ceil(s.H * 0.26));

      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.45})`;
        ctx.fillRect(0, 0, s.W, s.H);
      }

      if (s.milestoneFlash > 0) {
        ctx.globalAlpha = clamp(s.milestoneFlash, 0, 1);
        ctx.fillStyle = "#ffe27a";
        ctx.font = "800 22px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.milestoneText, s.W / 2, s.H * 0.2);
        ctx.globalAlpha = 1;
      }

      if (s.paused) drawPrompt(tRef.current("runnerGame.resume"), "");
      else if (s.phase === "ready") {
        drawPrompt(tRef.current("runnerGame.tapToStart"), tRef.current("runnerGame.controlsHint"));
      }
    };

    /* ---------------- input ---------------- */

    let ptrId = -1;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let gestureUsed = false;

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      audio.unlock(); // لازم يكون متزامن داخل الضغطة

      if (s.paused) {
        resumeRun();
        return;
      }
      if (s.phase === "ready") {
        startRun();
        return;
      }
      if (s.phase === "over") return;

      ptrId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startT = performance.now();
      gestureUsed = false;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    // كل لمسة = حركة وحدة بالضبط (يمين/يسار/قفزة)، حتى لو كمّلت تسحب إصبعك
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== ptrId || gestureUsed) return; // خلاص تنفّذت حركة، تجاهل باقي السحب
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < SWIPE_PX) return;

      gestureUsed = true; // يقفل أي حركة ثانية لين ترفع إصبعك وتلمس من جديد
      if (adx > ady) moveLane(dx > 0 ? 1 : -1);
      else if (dy < 0) doJump();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== ptrId) return;
      ptrId = -1;
      if (!gestureUsed && performance.now() - startT < TAP_MAX_MS) doJump();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const k = event.code;
      if (k === "ArrowLeft" || k === "KeyA") {
        event.preventDefault();
        audio.unlock();
        if (!event.repeat) moveLane(-1);
      } else if (k === "ArrowRight" || k === "KeyD") {
        event.preventDefault();
        audio.unlock();
        if (!event.repeat) moveLane(1);
      } else if (k === "ArrowUp" || k === "KeyW" || k === "Space") {
        event.preventDefault();
        audio.unlock();
        if (s.paused) resumeRun();
        else if (s.phase === "ready") startRun();
        else if (!event.repeat) doJump();
      }
    };

    const onVisibility = () => {
      if (document.hidden) pauseRun();
    };

    /* ---------------- loop ---------------- */

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = time;
      let dt = (time - last) / 1000;
      last = time;
      if (dt <= 0) return;
      // رجعنا من تبويب ثاني/تهنيج: لا نقفز بالزمن
      if (dt > 0.1) dt = 1 / 60;
      dt = Math.min(dt, 0.05);

      if (!s.paused) {
        // dt الفعلي للفريم يتقسّم لخطوات متساوية: حركة ناعمة بدون jitter + تصادم دقيق
        const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
        const h = dt / steps;
        for (let i = 0; i < steps; i += 1) update(h);
      }
      draw();
    };

    resize();
    s.speed = s.baseSpeed;
    s.px = laneX(s.lane);

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibility);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
      if (resultTimer) clearTimeout(resultTimer);
      tg?.enableVerticalSwipes?.();
      audio.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => {
    onExit(
      result ? result.coins : coinsForScore(scoreRef.current),
      result ? result.score : scoreRef.current
    );
  };

  const toggleMute = () => {
    const next = audioRef.current?.toggleMute();
    if (typeof next === "boolean") setMuted(next);
  };

  return (
    <section className="game-shell runner-shell">
      <canvas ref={canvasRef} className="game-canvas" />

      <div className="game-hud">
        <button className="hud-back" onClick={handleBack} aria-label={t("gameCanvas.backToLobby")}>
          <UiIcons name="back" className="hud-back-icon" />
        </button>

        <button
          className="hud-mute"
          onClick={toggleMute}
          aria-label={t("runnerGame.sound")}
          aria-pressed={!muted}
        >
          <svg viewBox="0 0 24 24" className="hud-mute-icon" aria-hidden="true">
            <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" />
            {muted ? (
              <path
                d="m15.5 9.5 5 5m0-5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            ) : (
              <path
                d="M15.5 9a4 4 0 0 1 0 6m2.4-8.6a7.5 7.5 0 0 1 0 11.2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </svg>
        </button>

        <div className="hud-row">
          <div className="hud-chip gold">
            <small>{t("runnerGame.score")}</small>
            <strong ref={scoreElRef}>0</strong>
          </div>

          <div className="hud-chip cyan">
            <small>{t("runnerGame.best")}</small>
            <strong ref={bestElRef}>{initialBest}</strong>
          </div>
        </div>

        {ready ? <div className="hud-status">{t("runnerGame.controlsHint")}</div> : null}
      </div>

      {result && (
        <div className="game-overlay">
          <div className={`result-card ${result.isNewBest ? "win" : "lose"}`}>
            <p className="result-kicker">
              {result.isNewBest ? t("runnerGame.newBest") : t("gameCanvas.runEnded")}
            </p>
            <h2>{result.score}</h2>
            <span>{t("runnerGame.runSummary", { coins: result.coins })}</span>
            <button
              onClick={() => {
                onExit(result.coins, result.score);
              }}
            >
              {t("gameCanvas.backToLobby")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
