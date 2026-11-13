// Shared Framer Motion effects + 3D-style SVG icons used by Crash / Mines / Dice / Blackjack.
import { motion, useAnimationControls } from "framer-motion";
import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";

/** Screen shake: bump `trigger` (a counter) to play it. Drop-in replacement for a <div className=…>. */
export function Shake({ trigger, className, children, power = 1 }: { trigger: number; className?: string; children: ReactNode; power?: number }) {
  const c = useAnimationControls();
  useEffect(() => {
    if (!trigger) return;
    const p = power;
    c.start({ x: [0, -11 * p, 10 * p, -7 * p, 5 * p, -2 * p, 0], y: [0, 5 * p, -6 * p, 4 * p, -2 * p, 0, 0], transition: { duration: 0.5, ease: "easeOut" } });
  }, [trigger]); // eslint-disable-line
  return <motion.div animate={c} className={className}>{children}</motion.div>;
}

/** Full-area colour flash (red on a bomb / crash). Bump `trigger` to play. */
export function Flash({ trigger, color = "rgba(231,76,60,.5)" }: { trigger: number; color?: string }) {
  const c = useAnimationControls();
  useEffect(() => { if (trigger) c.start({ opacity: [0, 1, 0], transition: { duration: 0.55, times: [0, 0.15, 1] } }); }, [trigger]); // eslint-disable-line
  return <motion.div aria-hidden="true" initial={{ opacity: 0 }} animate={c} style={{ position: "absolute", inset: 0, background: color, pointerEvents: "none", zIndex: 5 } as CSSProperties} />;
}

/** Sparkle burst, mounts once per reveal (give it a fresh `key`). */
export function Sparkle({ color = "#7CFFB2" }: { color?: string }) {
  return (
    <span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2, d = 26 + (i % 2) * 8;
        return <motion.i key={i} initial={{ x: 0, y: 0, scale: 0, opacity: 1 }} animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, scale: [0, 1.2, 0], opacity: [1, 1, 0] }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ position: "absolute", left: "50%", top: "50%", width: 6, height: 6, marginLeft: -3, marginTop: -3, background: color, borderRadius: 1, rotate: 45 }} />;
      })}
    </span>
  );
}

/** 3D-style emerald gem (layered facets + highlight). */
export const Gem3D = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,.55))" }}>
    <defs>
      <linearGradient id="gA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7CFFB2" /><stop offset="1" stopColor="#0E9F55" /></linearGradient>
      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2ECC71" /><stop offset="1" stopColor="#0A6B38" /></linearGradient>
    </defs>
    <path d="M8 4h16l6 8-14 17L2 12z" fill="url(#gB)" />
    <path d="M8 4h16l-4 8H12z" fill="url(#gA)" />
    <path d="M2 12h10l4 17zM30 12H20l-4 17z" fill="#0A6B38" opacity=".55" />
    <path d="M12 12h8l-4 17z" fill="#1DB866" />
    <path d="M10 6l-3 5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
  </svg>
);

/** 3D-style bomb (sphere gradient, fuse, spark). */
export const Bomb3D = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,.6))" }}>
    <defs><radialGradient id="bG" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#8A8D98" /><stop offset=".45" stopColor="#2A2C35" /><stop offset="1" stopColor="#08090C" /></radialGradient></defs>
    <circle cx="15" cy="19" r="10" fill="url(#bG)" />
    <ellipse cx="11.5" cy="15" rx="3" ry="2" fill="#fff" opacity=".35" transform="rotate(-35 11.5 15)" />
    <rect x="19" y="5.5" width="5" height="4" rx="1" fill="#555966" transform="rotate(35 21 7)" />
    <path d="M24 5c2-2 4-1 5-3" stroke="#C9A36B" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <circle cx="29" cy="2.5" r="2.2" fill="#FFB020" /><circle cx="29" cy="2.5" r="1" fill="#fff" />
  </svg>
);
