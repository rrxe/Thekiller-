// Sound layer (Howler.js). Only wins / cash-outs play a sound: no music, no engine loop, no UI clicks.
// Everything else keeps the old no-op API so existing call sites compile unchanged. Haptics live in ./telegram.
import { Howl } from "howler";

const KEY = "oddxs_muted";
let muted = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
const subs = new Set<() => void>();
export const isMuted = () => muted;
export const setMuted = (m: boolean) => {
  muted = m;
  try { localStorage.setItem(KEY, m ? "1" : "0"); } catch { /* ignore */ }
  subs.forEach((f) => f());
};
export const onMuteChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const cache: Record<string, Howl> = {};
const play = (name: "cash" | "win" | "bigwin", volume = 0.6) => {
  if (muted) return;
  const h = (cache[name] ??= new Howl({ src: [`/sfx/${name}.wav`], volume, preload: true }));
  h.play();
};

const noop = () => {};
export const sfx = {
  click: noop, tick: noop, countdown: (_n: number) => {}, launch: noop, milestone: (_l = 0) => {},
  cash: () => play("cash"),
  win: () => play("win"),
  bigWin: () => play("bigwin"),
  lose: noop, explode: noop, flip: noop,
  gem: (_n = 0) => {}, bomb: noop, roll: noop, deal: noop, coin: noop,
};
export const engine = { start: noop, set: (_m: number) => {}, stop: noop };
