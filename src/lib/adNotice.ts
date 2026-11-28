// Tiny store for the "click the ad" notices (withdrawal + exchange ads).
//  • noclick / short → shown AFTER a failed attempt (closed without clicking / came back too fast).
import { useSyncExternalStore } from "react";

export type AdNotice =
  | { kind: "noclick" | "short" | "required" | "support"; retry?: () => void }
  | null;

let cur: AdNotice = null;
const subs = new Set<() => void>();
const set = (n: AdNotice) => { cur = n; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useAdNotice = () => useSyncExternalStore(subscribe, () => cur, () => cur);

export function showAdFail(kind: "noclick" | "short" | "required" | "support", retry?: () => void) { set({ kind, retry }); }
export function closeAdNotice() { set(null); }
