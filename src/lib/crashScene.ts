// Dedicated 2D Canvas renderer for Crash. Game outcomes are never generated here:
// the server precomputes the crash point, while this class only paints the live scene.
import { crashMultAt } from "./engine";

export type SceneMode = "idle" | "countdown" | "flying" | "crashed";

interface Point { x: number; y: number }
interface Particle {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; radius: number; color: string; gravity: number;
}
interface Star { x: number; y: number; size: number; alpha: number; depth: number }

const TAU = Math.PI * 2;
const GRID_COLOR = "rgba(255,255,255,.055)";
const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
};

export class CrashScene {
  mode: SceneMode = "idle";
  mult = 1;
  t = 0;
  cashed = false;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private readonly stars: Star[] = [];
  private readonly particles: Particle[] = [];
  private readonly lowMotion = reducedMotion();
  private width = 320;
  private height = 300;
  private dpr = 1;
  private raf = 0;
  private lastFrame = 0;
  private clock = 0;
  private starDrift = 0;
  private trailClock = 0;
  private explosionAge = -1;
  private explosionAt: Point = { x: 0, y: 0 };
  private cashMarker: { time: number; mult: number } | null = null;
  private destroyed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("Crash requires a 2D canvas context");
    this.ctx = context;
    for (let i = 0; i < 76; i++) {
      const depth = i < 38 ? 0.28 : i < 62 ? 0.62 : 1;
      this.stars.push({
        x: Math.random(), y: Math.random(),
        size: 0.45 + Math.random() * (0.6 + depth * 1.1),
        alpha: 0.08 + Math.random() * (0.1 + depth * 0.2), depth,
      });
    }
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.raf = requestAnimationFrame(this.tick);
  }

  reset() {
    this.mode = "idle";
    this.mult = 1;
    this.t = 0;
    this.cashed = false;
    this.particles.length = 0;
    this.trailClock = 0;
    this.explosionAge = -1;
    this.cashMarker = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.particles.length = 0;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(120, rect.width || 320);
    this.height = Math.max(120, rect.height || 300);
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pixelWidth = Math.round(this.width * this.dpr);
    const pixelHeight = Math.round(this.height * this.dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
  }

  private tick = (timestamp: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, this.lastFrame ? (timestamp - this.lastFrame) / 1000 : 1 / 60);
    this.lastFrame = timestamp;
    this.clock += dt;
    this.draw(dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  private emit(x: number, y: number, angle: number, speed: number, life: number, radius: number, color: string, gravity = 0) {
    if (this.particles.length >= 300) this.particles.shift();
    const spread = (Math.random() - 0.5) * 0.9;
    const a = angle + Math.PI + spread;
    const v = speed * (0.55 + Math.random() * 0.9);
    this.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      age: 0, life: life * (0.7 + Math.random() * 0.6),
      radius: radius * (0.65 + Math.random() * 0.8), color, gravity,
    });
  }

  private draw(dt: number) {
    const { ctx, width: w, height: h, dpr } = this;
    const left = 34, right = 17, top = 26, bottom = 27;
    const plotW = Math.max(40, w - left - right);
    const plotH = Math.max(40, h - top - bottom);
    const running = this.mode === "flying";
    const ended = this.mode === "crashed";
    const active = running || ended;
    const xMax = Math.max(8, this.t * 1.15);
    const yMax = Math.max(2, Math.min(1_000_000, this.mult * 1.22));
    const xAt = (seconds: number) => left + (seconds / xMax) * plotW;
    const yAt = (multiple: number) => top + plotH - ((multiple - 1) / Math.max(0.01, yMax - 1)) * plotH;
    const origin = { x: left, y: yAt(1) };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const background = ctx.createLinearGradient(0, 0, 0, h);
    background.addColorStop(0, "#10182A");
    background.addColorStop(0.58, "#0B101D");
    background.addColorStop(1, "#080B12");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, Math.max(w, h) * 0.86);
    glow.addColorStop(0, ended ? "rgba(255,75,87,.12)" : `rgba(38,174,232,${0.13 + Math.min(.12, (this.mult - 1) * .004)})`);
    glow.addColorStop(1, "rgba(38,174,232,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    this.drawStars(dt, w, h, running);
    this.drawGrid(left, top, plotW, plotH, xMax, yMax);

    if (!active || this.t <= 0) {
      this.drawLaunchRocket(origin.x + 17, origin.y - 15);
      this.drawParticles(dt);
      return;
    }

    const pointCount = Math.min(140, Math.max(24, Math.ceil(this.t * 18)));
    const points: Point[] = [];
    for (let i = 0; i <= pointCount; i++) {
      const time = (this.t * i) / pointCount;
      const value = Math.min(this.mult, crashMultAt(time));
      points.push({ x: xAt(time), y: yAt(value) });
    }
    const end = points[points.length - 1];
    const before = points[Math.max(0, points.length - 3)];
    const angle = Math.atan2(end.y - before.y, end.x - before.x);

    this.drawFilledArea(points, end, top, plotH, ended);
    this.drawCurve(points, end, ended);

    if (this.cashed && !this.cashMarker) this.cashMarker = { time: this.t, mult: this.mult };
    if (this.cashMarker) {
      this.drawCashMarker(xAt(this.cashMarker.time), yAt(this.cashMarker.mult), this.cashMarker.mult);
    }

    if (running && !this.lowMotion) {
      this.trailClock += dt;
      while (this.trailClock >= 0.025) {
        this.trailClock -= 0.025;
        const back = 8 + Math.random() * 6;
        this.emit(end.x - Math.cos(angle) * back, end.y - Math.sin(angle) * back, angle, 25, .48, 2.1, Math.random() > .45 ? "62,190,255" : "160,130,255", 14);
      }
    }
    if (ended && this.explosionAge < 0) this.startExplosion(end);
    if (ended) this.drawExplosion(dt, end);
    this.drawParticles(dt);
    this.drawRocket(end.x, end.y, angle, running);
  }

  private drawStars(dt: number, w: number, h: number, moving: boolean) {
    const { ctx } = this;
    if (!this.lowMotion && moving) this.starDrift += dt * (0.018 + Math.min(this.mult, 30) * 0.0028);
    for (const star of this.stars) {
      const x = (((star.x - this.starDrift * star.depth) % 1) + 1) % 1;
      const y = (((star.y + this.starDrift * star.depth * .48) % 1) + 1) % 1;
      const twinkle = this.lowMotion ? 1 : .78 + .22 * Math.sin(this.clock * 1.6 + star.x * 37);
      ctx.fillStyle = `rgba(220,235,255,${star.alpha * twinkle})`;
      ctx.beginPath();
      ctx.arc(x * w, y * h, star.size, 0, TAU);
      ctx.fill();
    }
  }

  private drawGrid(left: number, top: number, width: number, height: number, xMax: number, yMax: number) {
    const { ctx } = this;
    ctx.save();
    ctx.font = "600 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const span = yMax - 1;
    const step = span < 2.5 ? .5 : span < 6 ? 1 : span < 15 ? 5 : span < 60 ? 10 : span < 150 ? 25 : 100;
    for (let multiple = 1; multiple <= yMax; multiple += step) {
      const y = top + height - ((multiple - 1) / Math.max(.01, span)) * height;
      ctx.strokeStyle = GRID_COLOR;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(220,230,250,.38)";
      ctx.fillText(`${multiple % 1 ? multiple.toFixed(1) : multiple}x`, left - 7, y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(220,230,250,.32)";
    const xStep = xMax > 60 ? 20 : xMax > 25 ? 10 : 5;
    for (let seconds = xStep; seconds < xMax; seconds += xStep) {
      ctx.fillText(`${seconds}s`, left + (seconds / xMax) * width, top + height + 7);
    }
    const axis = ctx.createLinearGradient(left, 0, left + width, 0);
    axis.addColorStop(0, "rgba(255,255,255,.2)");
    axis.addColorStop(1, "rgba(255,255,255,.025)");
    ctx.strokeStyle = axis;
    ctx.beginPath();
    ctx.moveTo(left, top + height + .5);
    ctx.lineTo(left + width, top + height + .5);
    ctx.stroke();
    ctx.restore();
  }

  private drawFilledArea(points: Point[], end: Point, top: number, plotH: number, crashed: boolean) {
    const { ctx } = this;
    const fill = ctx.createLinearGradient(0, top, 0, top + plotH);
    fill.addColorStop(0, crashed ? "rgba(255,77,91,.32)" : "rgba(44,173,236,.31)");
    fill.addColorStop(1, "rgba(44,173,236,.015)");
    ctx.beginPath();
    ctx.moveTo(points[0].x, top + plotH);
    for (const point of points) ctx.lineTo(point.x, point.y);
    ctx.lineTo(end.x, top + plotH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private drawCurve(points: Point[], end: Point, crashed: boolean) {
    const { ctx } = this;
    const line = ctx.createLinearGradient(points[0].x, points[0].y, end.x, end.y);
    line.addColorStop(0, crashed ? "#FF6C72" : "rgba(49,175,236,.58)");
    line.addColorStop(.48, crashed ? "#FF6C72" : "#39BAF2");
    line.addColorStop(1, crashed ? "#FF485C" : "#9D83FF");
    ctx.save();
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = line;
    ctx.shadowColor = crashed ? "rgba(255,70,86,.75)" : "rgba(69,173,255,.85)";
    ctx.shadowBlur = 17;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    // Quadratic midpoint smoothing avoids visibly segmented lines at low frame rates.
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) * .5;
      const midY = (points[i].y + points[i + 1].y) * .5;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawRocket(x: number, y: number, angle: number, running: boolean) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const pulse = this.lowMotion ? 1 : .82 + .18 * Math.sin(this.clock * 18);
    if (running && !this.lowMotion) {
      const flame = ctx.createRadialGradient(-12, 0, 1, -12, 0, 17);
      flame.addColorStop(0, "rgba(255,255,255,.95)");
      flame.addColorStop(.24, "rgba(91,220,255,.85)");
      flame.addColorStop(1, "rgba(126,117,255,0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.ellipse(-12, 0, 17, 6, 0, 0, TAU);
      ctx.fill();
    }
    ctx.shadowColor = running ? "#79DFFF" : "#A9B6D8";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#F5FAFF";
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.quadraticCurveTo(4, -10, -8, -5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-8, 5);
    ctx.quadraticCurveTo(4, 10, 13, 0);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#36BDEA";
    ctx.beginPath();
    ctx.moveTo(-5, -4);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-10, -1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.lineTo(-12, 10);
    ctx.lineTo(-10, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(148,229,255,${pulse})`;
    ctx.beginPath();
    ctx.arc(4, 0, 2.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawLaunchRocket(x: number, y: number) {
    const { ctx } = this;
    const countdown = this.mode === "countdown";
    const jitterX = countdown && !this.lowMotion ? Math.sin(this.clock * 38) * .8 : 0;
    const jitterY = countdown && !this.lowMotion ? Math.cos(this.clock * 43) * .8 : 0;
    if (countdown && !this.lowMotion && Math.random() > .6) {
      this.emit(x, y + 6, -Math.PI / 4, 15, .42, 1.5, "115,200,255", 12);
    }
    this.drawRocket(x + jitterX, y + jitterY, -Math.PI / 4, false);
  }

  private startExplosion(point: Point) {
    this.explosionAge = 0;
    this.explosionAt = point;
    if (this.lowMotion) return;
    const colors = ["255,80,95", "255,150,76", "255,210,120", "240,245,255"];
    for (let i = 0; i < 52; i++) {
      const angle = Math.random() * TAU;
      const speed = 48 + Math.random() * 190;
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push({
        x: point.x, y: point.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        age: 0, life: .48 + Math.random() * .58,
        radius: 1.1 + Math.random() * 2.4, color, gravity: 85,
      });
    }
  }

  private drawExplosion(dt: number, rocket: Point) {
    const { ctx } = this;
    if (this.explosionAge < 0) return;
    this.explosionAge += dt;
    const progress = Math.min(1, this.explosionAge / .62);
    const radius = 7 + progress * 42;
    ctx.save();
    ctx.strokeStyle = `rgba(255,110,105,${.68 * (1 - progress)})`;
    ctx.lineWidth = 2.4 * (1 - progress) + .4;
    ctx.beginPath();
    ctx.arc(this.explosionAt.x, this.explosionAt.y, radius, 0, TAU);
    ctx.stroke();
    const core = ctx.createRadialGradient(rocket.x, rocket.y, 0, rocket.x, rocket.y, 20);
    core.addColorStop(0, "rgba(255,255,255,.92)");
    core.addColorStop(.2, "rgba(255,104,100,.7)");
    core.addColorStop(1, "rgba(255,70,90,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(rocket.x, rocket.y, 20, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(dt: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += dt;
      if (particle.age >= particle.life) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const fade = 1 - particle.age / particle.life;
      ctx.fillStyle = `rgba(${particle.color},${.68 * fade})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * (.35 + .65 * fade), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCashMarker(x: number, y: number, multiple: number) {
    const { ctx, width: w } = this;
    ctx.save();
    ctx.fillStyle = "rgba(46,204,113,.18)";
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#38E58A";
    ctx.shadowColor = "rgba(46,204,113,.9)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    const label = `${multiple.toFixed(2)}x`;
    ctx.font = "800 11px Inter, system-ui, sans-serif";
    const width = ctx.measureText(label).width + 16;
    const labelX = Math.min(Math.max(x, width / 2 + 4), w - width / 2 - 4);
    const labelY = y < 34 ? y + 24 : y - 22;
    ctx.beginPath();
    ctx.roundRect(labelX - width / 2, labelY - 10, width, 20, 7);
    ctx.fillStyle = "rgba(15,68,42,.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(89,245,155,.62)";
    ctx.stroke();
    ctx.fillStyle = "#8AFFB8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX, labelY + .5);
    ctx.restore();
  }
}
