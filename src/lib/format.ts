import { POINTS_PER_USD } from "./engine";
let rate = POINTS_PER_USD;
/** admin can change points_per_usd; the store calls this after loading settings */
export const setRate = (r: number) => { if (r > 0) rate = r; };
/** 12.5 → "12.50", integers keep two decimals so balances never jump in width */
export const fmtPts = (cp: number) => (cp / 100).toFixed(2);
export const fmtMult = (m: number) => (m >= 100 ? m.toFixed(0) : m.toFixed(2)) + "×";
export const fmtUsd = (points: number) => { const v = points / rate; return "$" + v.toFixed(v < 0.1 ? 3 : 2); };
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
