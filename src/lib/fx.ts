// Motion layer. The design is quiet: no flashes, shakes or glows. Haptics + short number tweens only.
import gsap from "gsap";
import { haptic } from "./telegram";

const reduced = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

export const loseFx = () => { haptic.lose(); };
export const winFx = (_big = false) => { haptic.win(); };

/** Tween a number; calls onUpdate each frame. Returns the tween (kill it on unmount). */
export function tweenNumber(from: number, to: number, duration: number, onUpdate: (v: number) => void, ease = "power2.out") {
  const o = { v: from };
  if (reduced()) { onUpdate(to); return gsap.to(o, { v: to, duration: 0 }); }
  return gsap.to(o, { v: to, duration, ease, onUpdate: () => onUpdate(o.v) });
}

export { gsap };
