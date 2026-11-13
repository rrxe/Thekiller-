/**
 * crashDot.ts — canvas renderer for Crash: a sleek glowing dot (trading-cursor style) that leaves a neon trail.
 *   active  → blue / cyan trail      crashed → red trail + shock ring
 * The dot pulses softly while waiting and with a stronger pulse at lift-off. Pure drawing: no game logic.
 */
import { CRASH_GROWTH, crashMultAt, crashTimeAt } from "./engine";

export type DotMode = "waiting" | "running" | "crashed";
type RGB = [number, number, number];
const TAU = Math.PI * 2;
const CYAN: RGB = [34, 224, 255];
const BLUE: RGB = [62, 140, 255];
const RED: RGB = [255, 64, 84];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

export class CrashDot {
  mode: DotMode = "waiting";
  /** seconds since lift-off */
  t = 0;
  mult = 1;
  /** crash multiplier, used to freeze the trail end when crashed */
  crashMult = 1;
  private ctx: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private w = 320; private h = 300; private dpr = 1;
  private bg: HTMLCanvasElement | null = null;
  private xMax = 6; private yMax = 2;
  private clock = 0;
  private sinceLaunch = 99;
  private crashAge = -1;
  private cash: { t: number; m: number } | null = null;
  private lastMode: DotMode = "waiting";
  private glow: HTMLCanvasElement;
  private dead = false;

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("Crash needs a 2D canvas context");
    this.ctx = c;
    this.glow = this.sprite(96);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }
  destroy() { this.dead = true; this.ro.disconnect(); }
  markCashout(mult: number | null) { this.cash = mult ? { t: mult <= 1 ? 0 : crashTimeAt(mult), m: mult } : null; }

  private sprite(n: number) {
    const c = document.createElement("canvas"); c.width = c.height = n;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,.85)");
    r.addColorStop(0.45, "rgba(255,255,255,.28)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, n, n);
    return c;
  }
  private tinted(color: RGB, alpha: number, x: number, y: number, r: number) {
    // draw the white glow sprite then colour it with a radial gradient (cheap tint via 'lighter')
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.4, rgba(color, alpha * 0.35)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(120, r.width || 320); this.h = Math.max(120, r.height || 300);
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pw = Math.round(this.w * this.dpr), ph = Math.round(this.h * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    const bg = document.createElement("canvas"); bg.width = pw; bg.height = ph;
    const g = bg.getContext("2d")!; g.scale(this.dpr, this.dpr);
    const base = g.createLinearGradient(0, 0, 0, this.h);
    base.addColorStop(0, "#050711"); base.addColorStop(1, "#0a0f24");
    g.fillStyle = base; g.fillRect(0, 0, this.w, this.h);
    const vg = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.5)");
    g.fillStyle = vg; g.fillRect(0, 0, this.w, this.h);
    this.bg = bg;
  }

  reset() { this.t = 0; this.mult = 1; this.xMax = 6; this.yMax = 2; this.crashAge = -1; this.cash = null; this.sinceLaunch = 99; }

  draw(dtRaw: number) {
    if (this.dead) return;
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));
    this.clock += dt;
    const { ctx, w, h, dpr } = this;
    if (this.mode !== this.lastMode) {
      if (this.mode === "running") this.sinceLaunch = 0;
      if (this.mode === "crashed") this.crashAge = 0;
      this.lastMode = this.mode;
    }
    this.sinceLaunch += dt;
    if (this.crashAge >= 0) this.crashAge += dt;

    const L = 38, R = 20, T = 20, B = 24;
    const pw = w - L - R, ph = h - T - B;
    const tNow = this.mode === "waiting" ? 0 : this.t;
    const mNow = this.mode === "crashed" ? this.crashMult : this.mode === "running" ? crashMultAt(tNow) : 1;
    const k = 1 - Math.exp(-dt * 5);
    this.xMax += (Math.max(6, tNow * 1.12) - this.xMax) * k;
    this.yMax += (Math.max(2, mNow * 1.15) - this.yMax) * k;
    const px = (t: number) => L + (t / this.xMax) * pw;
    const py = (m: number) => T + ph - ((m - 1) / (this.yMax - 1)) * ph;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h); else { ctx.fillStyle = "#050711"; ctx.fillRect(0, 0, w, h); }

    this.grid(L, T, pw, ph, px, py);

    const crashed = this.mode === "crashed";
    const col: RGB = crashed ? RED : CYAN;
    const x = px(tNow), y = py(mNow);

    if (this.mode !== "waiting" && tNow > 0) this.trail(tNow, px, py, T + ph, col, crashed ? RED : BLUE);
    if (this.cash) this.cashMarker(px, py, L, pw);

    if (crashed) {
      this.burst(x, y);
    } else {
      this.dot(x, y, col, tNow, px, py);
    }
  }

  private grid(L: number, T: number, pw: number, ph: number, px: (t: number) => number, py: (m: number) => number) {
    const { ctx } = this;
    const baseY = T + ph;
    ctx.lineWidth = 1; ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "middle"; ctx.textAlign = "right";
    const ys = niceStep((this.yMax - 1) / 4);
    for (let i = 1; i < 12; i++) {
      const v = 1 + i * ys; if (v > this.yMax) break;
      const y = py(v);
      ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillStyle = "rgba(170,190,235,.5)"; ctx.fillText(`${+v.toFixed(2)}x`, L - 6, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const xs = niceStep(this.xMax / 5);
    for (let i = 1; i < 12; i++) {
      const t = i * xs; if (t > this.xMax) break;
      const x = px(t);
      ctx.strokeStyle = "rgba(255,255,255,.035)"; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, baseY); ctx.stroke();
      ctx.fillStyle = "rgba(170,190,235,.45)"; ctx.fillText(`${+t.toFixed(1)}s`, x, baseY + 6);
    }
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, baseY); ctx.lineTo(L + pw, baseY); ctx.stroke();
  }

  private trail(tEnd: number, px: (t: number) => number, py: (m: number) => number, baseY: number, head: RGB, tail: RGB) {
    const { ctx, dpr } = this;
    const n = 80;
    const pts: Array<[number, number]> = [];
    const endM = this.mode === "crashed" ? this.crashMult : crashMultAt(tEnd);
    for (let i = 0; i <= n; i++) {
      const t = (tEnd * i) / n;
      pts.push([px(t), py(Math.min(endM, crashMultAt(t)))]);
    }
    const first = pts[0], last = pts[n];
    // soft area
    const fill = ctx.createLinearGradient(0, last[1], 0, baseY);
    fill.addColorStop(0, rgba(head, 0.18)); fill.addColorStop(1, rgba(head, 0));
    ctx.beginPath(); ctx.moveTo(first[0], baseY);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(last[0], baseY); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    // neon stroke: transparent tail → bright head
    const grad = ctx.createLinearGradient(first[0], first[1], last[0], last[1]);
    grad.addColorStop(0, rgba(tail, 0)); grad.addColorStop(0.35, rgba(tail, 0.55)); grad.addColorStop(1, rgba(head, 1));
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(first[0], first[1]);
    for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.shadowColor = rgba(head, 0.95); ctx.shadowBlur = 18 * dpr;
    ctx.strokeStyle = grad; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
  }

  /** the dot itself: halo + white core + expanding pulse rings (stronger during the first ~1.4s after lift-off) */
  private dot(x: number, y: number, col: RGB, tNow: number, px: (t: number) => number, py: (m: number) => number) {
    const { ctx } = this;
    const launch = this.mode === "running" ? Math.max(0, 1 - this.sinceLaunch / 1.4) : 0;
    const breathe = 0.5 + 0.5 * Math.sin(this.clock * (this.mode === "waiting" ? 2.4 : 3.2));
    const pulse = this.mode === "waiting" ? 0.25 + breathe * 0.35 : 0.3 + launch * 0.7;
    ctx.globalCompositeOperation = "lighter";
    this.tinted(col, 0.55 + pulse * 0.3, x, y, 26 + pulse * 18);
    // pulse ring
    const ring = ((this.clock * (this.mode === "waiting" ? 0.9 : 1.6)) % 1);
    ctx.beginPath(); ctx.arc(x, y, 6 + ring * (16 + launch * 18), 0, TAU);
    ctx.strokeStyle = rgba(col, (1 - ring) * (0.35 + pulse * 0.5)); ctx.lineWidth = 1.6; ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    // chevron aligned to the curve tangent (trading-cursor feel)
    if (this.mode === "running" && tNow > 0.05) {
      const m = crashMultAt(tNow);
      const dx = px(tNow + 0.02) - px(tNow), dy = py(crashMultAt(tNow + 0.02)) - py(m);
      const a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = rgba(col, 0.9);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(7, -4.2); ctx.lineTo(7.8, 0); ctx.lineTo(7, 4.2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(x, y, 5.4, 0, TAU); ctx.fillStyle = "#fff";
    ctx.shadowColor = rgba(col, 1); ctx.shadowBlur = 16 * this.dpr; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x, y, 8.2, 0, TAU); ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.6; ctx.stroke();
  }

  private burst(x: number, y: number) {
    const { ctx } = this;
    const a = this.crashAge;
    // red afterglow dot that fades, plus a shock ring
    const fade = Math.max(0, 1 - a / 1.6);
    ctx.globalCompositeOperation = "lighter";
    this.tinted(RED, 0.6 * fade, x, y, 34);
    if (a < 0.7) {
      const k = a / 0.7;
      ctx.beginPath(); ctx.arc(x, y, 8 + k * 70, 0, TAU);
      ctx.strokeStyle = rgba(RED, (1 - k) * 0.9); ctx.lineWidth = 3 * (1 - k) + 0.5; ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath(); ctx.arc(x, y, 4.2, 0, TAU); ctx.fillStyle = rgba(RED, 0.4 + fade * 0.6); ctx.fill();
  }

  private cashMarker(px: (t: number) => number, py: (m: number) => number, L: number, pw: number) {
    const mk = this.cash!; const { ctx } = this;
    const x = px(mk.t), y = py(mk.m);
    ctx.globalCompositeOperation = "lighter"; this.tinted([46, 204, 113], 0.8, x, y, 22); ctx.globalCompositeOperation = "source-over";
    ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fillStyle = "#2ecc71"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
    const label = `${mk.m.toFixed(2)}×`;
    ctx.font = "700 11px ui-monospace, Menlo, monospace";
    const tw = ctx.measureText(label).width + 14;
    const bx = Math.min(L + pw - tw, Math.max(L, x - tw / 2));
    ctx.beginPath(); ctx.roundRect(bx, y - 29, tw, 18, 9); ctx.fillStyle = "rgba(46,204,113,.96)"; ctx.fill();
    ctx.fillStyle = "#052612"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, bx + tw / 2, y - 20);
  }
}

export { CRASH_GROWTH };
