import { useEffect, useRef, useState } from "react";
import "../styles/game.css";
import UiIcons from "./UiIcons";
import { useLanguage } from "../i18n/LanguageContext";

type Props = {
  onExit: (coinsEarned?: number) => void;
};

type Phase = "active" | "between" | "win" | "lose";

type Hud = {
  wave: number;
  energy: number;
  coins: number;
  status: string;
};

type Star = {
  x: number;
  y: number;
  r: number;
  vy: number;
  alpha: number;
};

type TrailPoint = {
  x: number;
  y: number;
};

type Crater = {
  x: number;
  y: number;
  r: number;
};

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  spin: number;
  active: boolean;
  hue: number;
  elite: boolean;
  trail: TrailPoint[];
  // شكل الصخرة: نسب نصف قطر غير منتظمة لكل زاوية (تولد مرة وحدة
  // عند الإنشاء) عشان كل نيزك يطلع بشكل مختلف وواقعي، مو نجمة متماثلة.
  shape: number[];
  craters: Crater[];
};

type Laser = {
  x: number;
  y: number;
  vy: number;
  active: boolean;
};

type Burst = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

type Banner = {
  title: string;
  subtitle: string;
  timer: number;
  tone: "wave" | "win" | "lose";
};

const TOTAL_WAVES = 5;
const WAVE_REWARD = 100;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function rectHit(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function makeStars(width: number, height: number): Star[] {
  return Array.from({ length: 120 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.7 + 0.4,
    vy: 12 + Math.random() * 40,
    alpha: 0.18 + Math.random() * 0.7,
  }));
}

function makeWave(wave: number, width: number): Meteor[] {
  const count = 11 + wave * 5;
  const cols = wave >= 4 ? 6 : 5;
  const lane = width / (cols + 1);
  const baseSpeed = 110 + wave * 18;
  const baseSize = 16 + wave * 2;

  return Array.from({ length: count }, (_, index) => {
    const elite = wave >= 3 && index % 8 === 0;
    const col = index % cols;
    const x = lane * (col + 1) + (Math.random() * 26 - 13);

    // شكل صخري غير منتظم (10 نقاط بنصف قطر عشوائي) بدل النجمة
    // المتماثلة القديمة - كل نيزك يطلع بسلوت شكل فريد.
    const shapePoints = elite ? 7 : 10;
    const shape = Array.from(
      { length: shapePoints },
      () => (elite ? 0.72 : 0.6) + Math.random() * (elite ? 0.42 : 0.55)
    );

    const craters: Crater[] = elite
      ? []
      : Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({
          x: (Math.random() - 0.5) * 0.9,
          y: (Math.random() - 0.5) * 0.9,
          r: 0.09 + Math.random() * 0.13,
        }));

    return {
      x: clamp(x, 22, width - 22),
      y: -80 - index * (24 + wave * 6) - Math.random() * 100,
      vx: (Math.random() - 0.5) * (24 + wave * 4),
      vy: baseSpeed + Math.random() * (26 + wave * 10) + (elite ? 22 : 0),
      size: baseSize + Math.random() * (elite ? 12 : 8),
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * (elite ? 4 : 6 + wave * 1.1),
      active: true,
      hue: elite ? 44 : 206 + Math.random() * 10,
      elite,
      trail: [],
      shape,
      craters,
    };
  });
}

export default function GameCanvas({ onExit }: Props) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  const stateRef = useRef({
    width: 0,
    height: 0,
    dpr: 1,
    phase: "active" as Phase,
    wave: 1,
    energy: 5,
    coins: 0,
    shipX: 0,
    shipY: 0,
    targetX: 0,
    targetY: 0,
    shipW: 48,
    shipH: 60,
    dragging: false,
    shootCd: 0,
    betweenTimer: 0,
    waveFlash: 0,
    shake: 0,
    spawnTimer: 0,
    stars: [] as Star[],
    meteors: [] as Meteor[],
    spawnQueue: [] as Meteor[],
    lasers: [] as Laser[],
    bursts: [] as Burst[],
    banner: {
      title: t("gameCanvas.waveLabel", { n: 1 }),
      subtitle: t("gameCanvas.braceForImpact"),
      timer: 1.1,
      tone: "wave" as Banner["tone"],
    },
  });

  const [hud, setHud] = useState<Hud>({
    wave: 1,
    energy: 5,
    coins: 0,
    status: t("gameCanvas.waveStatus", { n: 1, total: TOTAL_WAVES }),
  });

  const [result, setResult] = useState<null | {
    title: string;
    text: string;
    tone: "win" | "lose";
  }>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;

    const s = stateRef.current;

    const ensureAudio = async () => {
      if (!audioRef.current) {
        const AudioCtor =
          window.AudioContext ||
          (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

        if (!AudioCtor) return;
        audioRef.current = new AudioCtor();
      }

      if (audioRef.current.state === "suspended") {
        await audioRef.current.resume();
      }
    };

    const tone = (
      freq: number,
      duration: number,
      type: OscillatorType = "sine",
      gainValue = 0.05,
      detune = 0
    ) => {
      const ac = audioRef.current;
      if (!ac) return;

      const osc = ac.createOscillator();
      const gain = ac.createGain();

      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;

      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(gainValue, ac.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start();
      osc.stop(ac.currentTime + duration + 0.03);
    };

    const sfx = (kind: "wave" | "shoot" | "clear" | "hit" | "win" | "lose") => {
      if (!audioRef.current) return;

      if (kind === "wave") {
        tone(220, 0.08, "triangle", 0.03);
        tone(440, 0.11, "sine", 0.025);
      } else if (kind === "shoot") {
        tone(860, 0.04, "square", 0.02);
      } else if (kind === "clear") {
        tone(330, 0.08, "triangle", 0.04);
        tone(660, 0.1, "sine", 0.04);
        tone(990, 0.13, "sine", 0.03);
      } else if (kind === "hit") {
        tone(120, 0.12, "sawtooth", 0.05);
        tone(80, 0.18, "triangle", 0.03);
      } else if (kind === "win") {
        tone(392, 0.12, "triangle", 0.04);
        tone(523.25, 0.14, "triangle", 0.04);
        tone(659.25, 0.18, "sine", 0.04);
      } else if (kind === "lose") {
        tone(196, 0.16, "sawtooth", 0.05);
        tone(98, 0.24, "triangle", 0.04);
      }
    };

    const vibrate = (pattern: number | number[]) => {
      if (navigator.vibrate) navigator.vibrate(pattern);
    };

    const burst = (x: number, y: number, color: string) => {
      for (let i = 0; i < 16; i += 1) {
        s.bursts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 360,
          vy: (Math.random() - 0.5) * 360,
          life: 0.38 + Math.random() * 0.35,
          size: 1.3 + Math.random() * 3.4,
          color,
        });
      }
    };

    const spawnWave = (wave: number) => {
      s.phase = "active";
      s.wave = wave;
      s.shootCd = 0;
      s.spawnTimer = 0;
      s.spawnQueue = makeWave(wave, s.width);
      s.meteors = [];
      s.lasers = [];
      s.banner = {
        title: t("gameCanvas.waveLabel", { n: wave }),
        subtitle: wave === 5 ? t("gameCanvas.finalStorm") : wave >= 4 ? t("gameCanvas.meteorPressureRising") : t("gameCanvas.incomingRocks"),
        timer: 1.05,
        tone: "wave",
      };
      s.waveFlash = 1;
      sfx("wave");

      setHud({
        wave,
        energy: s.energy,
        coins: s.coins,
        status: t("gameCanvas.waveStatus", { n: wave, total: TOTAL_WAVES }),
      });
      setResult(null);
    };

    const finishWin = () => {
      if (s.phase === "win" || s.phase === "lose") return;
      s.phase = "win";
      const winSubtitle = t("gameCanvas.missionCompleteSubtitle", { total: TOTAL_WAVES, coins: s.coins });
      s.banner = {
        title: t("gameCanvas.missionComplete"),
        subtitle: winSubtitle,
        timer: 2.2,
        tone: "win",
      };
      s.waveFlash = 1;
      sfx("win");
      vibrate([50, 60, 80]);

      setHud({
        wave: TOTAL_WAVES,
        energy: s.energy,
        coins: s.coins,
        status: t("gameCanvas.missionCompleteStatus"),
      });

      setResult({
        title: t("gameCanvas.missionCompleteStatus"),
        text: winSubtitle,
        tone: "win",
      });
    };

    const finishLose = (reason = t("gameCanvas.meteorEscaped")) => {
      if (s.phase === "win" || s.phase === "lose") return;
      s.phase = "lose";
      s.banner = {
        title: t("gameCanvas.runFailed"),
        subtitle: reason,
        timer: 2.2,
        tone: "lose",
      };
      s.waveFlash = 1;
      sfx("lose");
      vibrate([120, 40, 120]);

      setHud({
        wave: s.wave,
        energy: s.energy,
        coins: s.coins,
        status: t("gameCanvas.runFailedStatus"),
      });

      setResult({
        title: t("gameCanvas.runFailedStatus"),
        text: t("gameCanvas.runFailedText", { reason, coins: s.coins }),
        tone: "lose",
      });
    };

    // نظام أرواح حقيقي: كل ضربة أو نيزك فايت تنقص وحدة طاقة بس ما
    // تخلص المحاولة إلا لما توصل الطاقة للصفر (بدل الموت من أول خطأ
    // اللي كان بالنسخة القديمة - هذا هو الخلل اللي كان يخلي اللعبة
    // قاسية بدون داعي).
    const damageShip = (reason: string) => {
      s.energy = Math.max(0, s.energy - 1);
      s.shake = Math.max(s.shake, 0.32);
      sfx("hit");
      vibrate(60);

      if (s.energy <= 0) {
        finishLose(reason);
        return;
      }

      s.banner = {
        title: t("gameCanvas.minusOneLife"),
        subtitle: reason,
        timer: 0.7,
        tone: "lose",
      };
      s.waveFlash = 0.55;

      setHud({
        wave: s.wave,
        energy: s.energy,
        coins: s.coins,
        status: t("gameCanvas.livesLeft", {
          count: s.energy,
          unit: s.energy === 1 ? t("gameCanvas.life") : t("gameCanvas.lives"),
        }),
      });
    };

    const addLaser = () => {
      s.lasers.push({
        x: s.shipX + s.shipW / 2 - 2,
        y: s.shipY - 10,
        vy: -980,
        active: true,
      });
      sfx("shoot");
    };

    const spawnFromQueue = (dt: number) => {
      if (s.phase !== "active") return;

      s.spawnTimer -= dt;
      const interval = Math.max(0.055, 0.16 - (s.wave - 1) * 0.017);

      if (s.spawnTimer <= 0 && s.spawnQueue.length > 0) {
        const burstCount = s.wave >= 4 ? 2 : 1;
        for (let i = 0; i < burstCount && s.spawnQueue.length > 0; i += 1) {
          const next = s.spawnQueue.shift();
          if (next) s.meteors.push(next);
        }
        s.spawnTimer = interval;
      }
    };

    const updateStars = (dt: number) => {
      for (const star of s.stars) {
        star.y += star.vy * dt;
        if (star.y > s.height + 4) {
          star.y = -4;
          star.x = Math.random() * s.width;
        }
      }
    };

    const updateBursts = (dt: number) => {
      s.bursts = s.bursts.filter((b) => {
        b.life -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= 0.965;
        b.vy *= 0.965;
        return b.life > 0;
      });
    };

    const updateLasers = (dt: number) => {
      for (const laser of s.lasers) {
        laser.y += laser.vy * dt;
        if (laser.y < -30) laser.active = false;
      }
      s.lasers = s.lasers.filter((l) => l.active);
    };

    const updateMeteors = (dt: number) => {
      for (const meteor of s.meteors) {
        meteor.rot += meteor.spin * dt;
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        meteor.trail.unshift({ x: meteor.x, y: meteor.y });

        if (meteor.trail.length > 10) {
          meteor.trail.pop();
        }

        if (meteor.x < 14 || meteor.x > s.width - 14) {
          meteor.vx *= -1;
        }
      }

      for (const laser of s.lasers) {
        for (const meteor of s.meteors) {
          if (
            meteor.active &&
            laser.active &&
            rectHit(
              laser.x,
              laser.y,
              4,
              18,
              meteor.x - meteor.size,
              meteor.y - meteor.size,
              meteor.size * 2,
              meteor.size * 2
            )
          ) {
            meteor.active = false;
            laser.active = false;
            burst(
              meteor.x,
              meteor.y,
              meteor.elite ? "rgba(255,210,90,.98)" : "rgba(78,167,255,.92)"
            );
          }
        }
      }

      s.meteors = s.meteors.filter((meteor) => {
        if (!meteor.active) return false;

        if (meteor.y - meteor.size > s.height) {
          damageShip(t("gameCanvas.meteorEscaped"));
          return false;
        }

        if (
          rectHit(
            s.shipX,
            s.shipY,
            s.shipW,
            s.shipH,
            meteor.x - meteor.size,
            meteor.y - meteor.size,
            meteor.size * 2,
            meteor.size * 2
          )
        ) {
          burst(meteor.x, meteor.y, "rgba(255,120,120,.95)");
          damageShip(t("gameCanvas.shipHit"));
          return false;
        }

        return true;
      });

      return s.phase !== "active";
    };

    const drawBackground = () => {
      const gradient = ctx.createLinearGradient(0, 0, 0, s.height);
      gradient.addColorStop(0, "#0a1730");
      gradient.addColorStop(0.55, "#050b18");
      gradient.addColorStop(1, "#02050c");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, s.width, s.height);

      for (const star of s.stars) {
        ctx.save();
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = "#dff3ff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    const drawShip = () => {
      const x = s.shipX;
      const y = s.shipY;
      const w = s.shipW;
      const h = s.shipH;
ctx.save();
      ctx.translate(x + w / 2, y + h / 2);

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(78,167,255,.55)";
      ctx.beginPath();
      ctx.ellipse(0, h * 0.42, w * 0.36, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      grad.addColorStop(0, "#eaf6ff");
      grad.addColorStop(0.5, "#8fc7ff");
      grad.addColorStop(1, "#2f6fd6");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, h * 0.28);
      ctx.lineTo(w * 0.22, h / 2);
      ctx.lineTo(-w * 0.22, h / 2);
      ctx.lineTo(-w / 2, h * 0.28);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(10,20,40,.55)";
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.08, w * 0.16, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawMeteor = (meteor: Meteor) => {
      if (!meteor.active) return;

      // ذيل مذنّب متناقص الحجم والشفافية بدل دوائر ثابتة الحجم -
      // يعطي إحساس حركة وسرعة أوضح.
      const trailLen = meteor.trail.length;
      for (let i = 0; i < trailLen; i += 1) {
        const point = meteor.trail[i];
        const t = i / Math.max(1, trailLen - 1);
        const trailSize = meteor.size * (0.5 - t * 0.38);
        if (trailSize <= 0.4) continue;

        const alpha = (1 - t) * (meteor.elite ? 0.32 : 0.2);
        ctx.save();
        ctx.globalAlpha = alpha;

        const trailGrad = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          trailSize
        );

        if (meteor.elite) {
          trailGrad.addColorStop(0, "#fff3cf");
          trailGrad.addColorStop(1, "rgba(255,178,46,0)");
        } else {
          trailGrad.addColorStop(0, "#9fd4ff");
          trailGrad.addColorStop(1, "rgba(58,90,140,0)");
        }

        ctx.fillStyle = trailGrad;
        ctx.beginPath();
        ctx.arc(point.x, point.y, trailSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(meteor.x, meteor.y);
      ctx.rotate(meteor.rot);

      // إضاءة من زاوية ثابتة (مو من المنتصف) عشان تحس بعمق/نتوءات
      // حقيقية على سطح الصخرة بدل تدرج كروي مسطح.
      const grad = ctx.createRadialGradient(
        -meteor.size * 0.28,
        -meteor.size * 0.28,
        meteor.size * 0.08,
        0,
        0,
        meteor.size * 1.05
      );

      if (meteor.elite) {
        grad.addColorStop(0, "#fff6da");
        grad.addColorStop(0.5, "#ffcf5c");
        grad.addColorStop(1, "#8a5a12");
      } else {
        grad.addColorStop(0, "#cddcef");
        grad.addColorStop(0.55, "#7c8ea8");
        grad.addColorStop(1, "#262e40");
      }

      ctx.fillStyle = grad;
      ctx.beginPath();

      // شكل صخري غير منتظم (مولّد مرة وحدة عند الإنشاء، مخزن
      // بـmeteor.shape) بدل النجمة المتماثلة القديمة.
      const points = meteor.shape.length;
      for (let i = 0; i < points; i += 1) {
        const angle = (i / points) * Math.PI * 2;
        const radius = meteor.size * meteor.shape[i];
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = meteor.elite
        ? "rgba(255,255,255,.55)"
        : "rgba(255,255,255,.14)";
      ctx.lineWidth = meteor.elite ? 1.5 : 1;
      ctx.stroke();

      if (meteor.elite) {
        // عروق ذهبية متوهجة على الصخور النادرة (مكافأة أعلى)
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.85)";
        ctx.lineWidth = 1.4;
        ctx.shadowColor = "rgba(255,214,110,.9)";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(-meteor.size * 0.32, -meteor.size * 0.12);
        ctx.lineTo(meteor.size * 0.12, meteor.size * 0.04);
        ctx.lineTo(-meteor.size * 0.02, meteor.size * 0.42);
        ctx.stroke();
        ctx.restore();
      } else {
        // فوهات/حفر سطحية للصخور العادية
        ctx.fillStyle = "rgba(10,14,24,.4)";
        for (const crater of meteor.craters) {
          ctx.beginPath();
          ctx.arc(
            crater.x * meteor.size,
            crater.y * meteor.size,
            crater.r * meteor.size,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      ctx.restore();
    };

    const drawLaser = (laser: Laser) => {
      ctx.save();
      ctx.fillStyle = "#7cf0ff";
      ctx.shadowColor = "rgba(124,240,255,.8)";
      ctx.shadowBlur = 8;
      ctx.fillRect(laser.x, laser.y, 4, 18);
      ctx.restore();
    };

    const drawBurst = (burstItem: Burst) => {
      ctx.save();
      ctx.globalAlpha = clamp(burstItem.life * 2, 0, 1);
      ctx.fillStyle = burstItem.color;
      ctx.beginPath();
      ctx.arc(burstItem.x, burstItem.y, burstItem.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawBanner = () => {
      if (s.banner.timer <= 0) return;

      const alpha = clamp(s.banner.timer / 1.05, 0, 1);

      const fillColor =
        s.banner.tone === "win"
          ? "rgba(255,210,90,.08)"
          : s.banner.tone === "lose"
            ? "rgba(255,90,90,.08)"
            : "rgba(78,167,255,.06)";

      const strokeColor =
        s.banner.tone === "win"
          ? "rgba(255,210,90,.30)"
          : s.banner.tone === "lose"
            ? "rgba(255,100,100,.30)"
            : "rgba(78,167,255,.30)";

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, s.width, s.height);

      const boxW = Math.min(s.width - 32, 360);
      const boxH = 114;
      const boxX = (s.width - boxW) / 2;
      const boxY = s.height * 0.23;

      ctx.fillStyle = "rgba(10,16,28,.78)";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      roundRect(ctx, boxX, boxY, boxW, boxH, 22);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#dff3ff";
      ctx.font = "700 22px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.banner.title, s.width / 2, boxY + 42);

      ctx.fillStyle = "#92a1b7";
      ctx.font = "600 13px Inter, system-ui, sans-serif";
      ctx.fillText(s.banner.subtitle, s.width / 2, boxY + 78);

      ctx.restore();
    };

    const roundRect = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number
    ) => {
      const corner = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + corner, y);
      context.arcTo(x + width, y, x + width, y + height, corner);
      context.arcTo(x + width, y + height, x, y + height, corner);
      context.arcTo(x, y + height, x, y, corner);
      context.arcTo(x, y, x + width, y, corner);
      context.closePath();
    };

    const update = (dt: number) => {
      if (s.banner.timer > 0) s.banner.timer -= dt;
      if (s.waveFlash > 0) s.waveFlash = Math.max(0, s.waveFlash - dt * 1.8);

      if (s.phase === "active") {
        if (s.dragging) {
          s.shipX = s.targetX;
          s.shipY = s.targetY;
        } else {
          s.shipX = lerp(s.shipX, s.targetX, 1 - Math.pow(0.001, dt));
          s.shipY = lerp(s.shipY, s.targetY, 1 - Math.pow(0.001, dt));
        }

        s.shipX = clamp(s.shipX, 16, s.width - s.shipW - 16);
        s.shipY = clamp(s.shipY, s.height * 0.34, s.height - s.shipH - 18);

        s.shootCd += dt;
        if (s.shootCd >= 0.15) {
          s.shootCd = 0;
          addLaser();
        }

        spawnFromQueue(dt);
        updateLasers(dt);

        const ended = updateMeteors(dt);
        if (ended) return true;

        updateBursts(dt);
        updateStars(dt);

        if (s.spawnQueue.length === 0 && s.meteors.length === 0) {
          s.coins += WAVE_REWARD;
          sfx("clear");
          s.banner = {
            title: t("gameCanvas.waveClearedTitle", { n: s.wave }),
            subtitle: t("gameCanvas.waveClearedCoins", { amount: WAVE_REWARD }),
            timer: 1.0,
            tone: "wave",
          };
          s.waveFlash = 1;
          setHud({
            wave: s.wave,
            energy: s.energy,
            coins: s.coins,
            status: t("gameCanvas.waveClearedStatus", { n: s.wave, amount: WAVE_REWARD }),
          });

          if (s.wave >= TOTAL_WAVES) {
            finishWin();
            return true;
          }

          s.phase = "between";
          s.betweenTimer = 0.85;
        }
      } else if (s.phase === "between") {
        updateBursts(dt);
        updateStars(dt);

        s.betweenTimer -= dt;
        if (s.betweenTimer <= 0) {
          spawnWave(s.wave + 1);
        }
      } else {
        updateBursts(dt);
        updateStars(dt);
      }

      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);

      return false;
    };

    const draw = () => {
      drawBackground();

      if (s.waveFlash > 0) {
        ctx.save();
        ctx.globalAlpha = s.waveFlash * 0.18;
        ctx.fillStyle = "#4ea7ff";
        ctx.fillRect(0, 0, s.width, s.height);
        ctx.restore();
      }

      if (s.shake > 0) {
        const sx = (Math.random() - 0.5) * 8 * s.shake;
        const sy = (Math.random() - 0.5) * 8 * s.shake;
        ctx.save();
        ctx.translate(sx, sy);
      }

      for (const laser of s.lasers) drawLaser(laser);
      for (const meteor of s.meteors) drawMeteor(meteor);
      for (const burstItem of s.bursts) drawBurst(burstItem);
      drawShip();

      if (s.shake > 0) ctx.restore();

      drawBanner();

      ctx.save();
      ctx.globalAlpha = 0.16;
      const bottomGlow = ctx.createLinearGradient(0, s.height - 160, 0, s.height);
      bottomGlow.addColorStop(0, "rgba(78,167,255,0)");
      bottomGlow.addColorStop(1, "rgba(78,167,255,.20)");
      ctx.fillStyle = bottomGlow;
      ctx.fillRect(0, s.height - 160, s.width, 160);
      ctx.restore();
    };

    const setTargetFromEvent = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      s.targetX = clamp(clientX - rect.left - s.shipW / 2, 16, s.width - s.shipW - 16);
      s.targetY = clamp(clientY - rect.top - s.shipH / 2, s.height * 0.34, s.height - s.shipH - 18);

      if (s.dragging) {
        s.shipX = s.targetX;
        s.shipY = s.targetY;
      }
    };

    const onPointerDown = async (event: PointerEvent) => {
      s.dragging = true;
      setTargetFromEvent(event.clientX, event.clientY);
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      await ensureAudio();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!s.dragging) return;
      setTargetFromEvent(event.clientX, event.clientY);
    };

    const onPointerUp = () => {
      s.dragging = false;
    };

    const resize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth || window.innerWidth;
      const height = parent?.clientHeight || window.innerHeight;
      const dpr = window.devicePixelRatio || 1;

      s.width = width;
      s.height = height;
      s.dpr = dpr;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (s.stars.length === 0) {
        s.stars = makeStars(width, height);
      }

      s.shipX = width / 2 - s.shipW / 2;
      s.shipY = height - 120;
      s.targetX = s.shipX;
      s.targetY = s.shipY;
    };

    resize();
    spawnWave(1);

    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    rafRef.current = requestAnimationFrame(function loop(time: number) {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = Math.min(0.033, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;

      update(dt);
      draw();

      rafRef.current = requestAnimationFrame(loop);
    });

    return () => {
      window.removeEventListener("resize", resize);

      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, []);

  return (
    <section className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" />

      <div className="game-hud">
        <button
          className="hud-back"
          onClick={() => onExit(hud.coins)}
          aria-label={t("gameCanvas.backToLobby")}
        >
          <UiIcons name="back" className="hud-back-icon" />
        </button>

        <div className="hud-row">
          <div className="hud-chip">
            <small>{t("gameCanvas.wave")}</small>
            <strong>
              {hud.wave}/{TOTAL_WAVES}
            </strong>
          </div>

          <div className="hud-chip gold">
            <small>{t("gameCanvas.coins")}</small>
            <strong>{hud.coins}</strong>
          </div>

          <div className="hud-chip cyan">
            <small>{t("gameCanvas.energy")}</small>
            <strong>{hud.energy}/5</strong>
          </div>
        </div>

        <div className="hud-status">{hud.status}</div>
      </div>

      {result && (
        <div className="game-overlay">
          <div className={`result-card ${result.tone}`}>
            <p className="result-kicker">
              {result.tone === "win" ? t("gameCanvas.victory") : t("gameCanvas.runEnded")}
            </p>
            <h2>{result.title}</h2>
            <span>{result.text}</span>
            <button onClick={() => onExit(hud.coins)}>{t("gameCanvas.backToLobby")}</button>
          </div>
        </div>
      )}
    </section>
  );
}

