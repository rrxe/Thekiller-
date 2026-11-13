// Tiny toast store: one message at a time, auto-dismiss after 2s.
import { useSyncExternalStore } from "react";

type Toast = { id: number; text: string } | null;
let current: Toast = null;
let timer: number | undefined;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function toast(text: string, ms = 2000) {
  if (!text) return;
  seq += 1;
  current = { id: seq, text };
  emit();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { current = null; emit(); }, ms);
}
export const useToast = () => useSyncExternalStore(subscribe, () => current, () => current);
