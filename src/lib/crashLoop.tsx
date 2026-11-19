/**
 * crashLoop.tsx — the GLOBAL 24/7 Crash loop.
 *
 *   WAITING (7s countdown) → RUNNING → CRASHED (3s) → WAITING → …
 *
 * The engine lives OUTSIDE React (one instance, mounted once by <CrashLoopProvider> at app level), so it keeps
 * ticking while the player is on another screen. Time is always derived from Date.now(), never from tick counts,
 * so throttled background timers cannot drift the schedule.
 *
 * MONEY IS SERVER-SIDE. A round without a bet is a "spectator" round (visual only, nothing at stake). When the
 * player bets during WAITING, the server creates a real provably-fair round aligned to this round's lift-off
 * (`launchIn`), and the loop follows that round's server-revealed crash point instead.
 *
 * CASH-OUT FIX: the click is timestamped on the client the instant it happens (Date.now()+serverOffset) and sent
 * as `at`. The server judges the click at THAT time, so network latency can no longer turn a 1.50x cash-out into
 * a loss when the crash point is 1.80x. While a cash-out is in flight the loop is not allowed to declare a crash.
 */
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { actions, getState } from "./store";
import { getApi, ApiError } from "./api";
import { CRASH_RTP, crashMultAt } from "./engine";

export type LoopPhase = "WAITING" | "RUNNING" | "CRASHED";
export const WAIT_MS = 7000;
export const CRASHED_MS = 3200;
export const BETS_CLOSE_MS = 1000; // bets lock this long before lift-off (server needs time to register the round)
const POLL_MS = 220;
const SPECTATOR_CAP = 100; // spectator rounds never exceed 100x (visual only)

export interface Settled { status: "cashed" | "crashed"; mult: number; payoutCp: number; crashPoint: number }
export interface Bet {
  id: string; stakeCp: number; auto: number | null;
  /** server clock − client clock, measured when the round was created */
  offset: number;
  result: Settled | null;
  /** a cash-out request is in flight (optimistic) */
  cashing: boolean;
  /** multiplier on screen at the instant of the click */
  clickMult: number | null;
}
export interface LoopSnapshot {
  version: number; phase: LoopPhase; roundNo: number;
  bet: Bet | null; history: number[]; placing: boolean; error: string | null;
}
export interface LoopTiming {
  phase: LoopPhase; elapsed: number; waitLeftMs: number; mult: number;
  /** crash point if known to this client (spectator rounds, or a settled bet) */
  crashPoint: number | null;
}

const floor2 = (v: number) => Math.floor(v * 100) / 100;
function spectatorCrashPoint(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const u = (buf[0] * 2 ** 20 + (buf[1] >>> 12)) / 2 ** 52; // 52-bit uniform
  return Math.min(SPECTATOR_CAP, Math.max(1, Math.floor((100 * CRASH_RTP) / (1 - u)) / 100));
}

export class CrashLoop {
  phase: LoopPhase = "WAITING";
  roundNo = 0;
  launchAt = 0;          // client clock (ms)
  private crashedAt = 0;
  private spectatorCp = 1;
  private bet: Bet | null = null;
  private history: number[] = [];
  private placing = false;
  private error: string | null = null;
  private version = 0;
  private snap: LoopSnapshot;
  private subs = new Set<() => void>();
  private timer = 0;
  private polling = false;
  private lastPoll = 0;
  private started = false;
  private crashPointNow: number | null = null;

  constructor() { this.beginWaiting(); this.snap = this.makeSnap(); }

  /* ── external-store plumbing ── */
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  getSnapshot = () => this.snap;
  private makeSnap(): LoopSnapshot {
    return { version: this.version, phase: this.phase, roundNo: this.roundNo, bet: this.bet ? { ...this.bet } : null, history: this.history, placing: this.placing, error: this.error };
  }
  private emit() { this.version++; this.snap = this.makeSnap(); this.subs.forEach((f) => f()); }

  /* ── lifecycle ── */
  start() {
    if (this.started) return;
    this.started = true;
    this.adoptResume();
    this.timer = window.setInterval(() => this.tick(), 50);
    document.addEventListener("visibilitychange", this.onVisible);
  }
  stop() {
    this.started = false;
    window.clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.onVisible);
  }
  private onVisible = () => { if (!document.hidden) this.tick(); };

  /** a server round that was still running when the app (re)opened: follow it instead of a spectator round */
  private adoptResume() {
    const rc = getState().resume?.crash;
    if (!rc || rc.status !== "running" || !rc.launchAt) return;
    const offset = rc.serverNow - Date.now();
    this.launchAt = rc.launchAt - offset;
    this.bet = { id: rc.id, stakeCp: rc.stakeCp ?? 0, auto: null, offset, result: null, cashing: false, clickMult: null };
    this.phase = Date.now() >= this.launchAt ? "RUNNING" : "WAITING";
    this.crashPointNow = null;
    this.emit();
  }

  private beginWaiting() {
    this.roundNo++;
    this.phase = "WAITING";
    this.launchAt = Date.now() + WAIT_MS;
    this.spectatorCp = spectatorCrashPoint();
    this.bet = null;
    this.placing = false;
    this.crashPointNow = null;
  }

  /* ── time ── */
  /** read every animation frame by the UI (no React renders involved) */
  timing(): LoopTiming {
    const now = Date.now();
    const elapsed = (now - this.launchAt) / 1000;
    const cp = this.knownCrashPoint();
    let mult = 1;
    if (this.phase === "RUNNING") mult = floor2(crashMultAt(Math.max(0, elapsed)));
    else if (this.phase === "CRASHED") mult = cp ?? 1;
    return { phase: this.phase, elapsed, waitLeftMs: this.phase === "WAITING" ? Math.max(0, this.launchAt - now) : 0, mult: cp !== null && mult > cp ? cp : mult, crashPoint: cp };
  }
  private knownCrashPoint(): number | null {
    if (this.bet) return this.bet.result ? this.bet.result.crashPoint : null;
    return this.spectatorCp;
  }

  private tick() {
    const now = Date.now();
    if (this.phase === "WAITING") {
      if (now >= this.launchAt) { this.phase = "RUNNING"; this.emit(); }
      return;
    }
    if (this.phase === "RUNNING") {
      const elapsed = (now - this.launchAt) / 1000;
      const raw = crashMultAt(Math.max(0, elapsed));
      const bet = this.bet;
      // poll the server for a bet round (settles crashes + auto cash-outs)
      if (bet && !bet.result && !bet.cashing && now - this.lastPoll >= POLL_MS) void this.poll();
      const cp = this.knownCrashPoint();
      // never declare a crash while a cash-out request is still in flight
      if (cp !== null && raw >= cp && !(bet && bet.cashing)) {
        this.phase = "CRASHED";
        this.crashedAt = now;
        this.history = [cp, ...this.history].slice(0, 14);
        this.emit();
      }
      return;
    }
    if (now - this.crashedAt >= CRASHED_MS) { this.beginWaiting(); this.emit(); }
  }

  /* ── player actions ── */
  /** true while the betting window is open */
  canBet(): boolean {
    return this.phase === "WAITING" && !this.bet && !this.placing && this.launchAt - Date.now() > BETS_CLOSE_MS;
  }

  async placeBet(stakeCp: number, auto: number | null): Promise<ApiError | Error | null> {
    if (!this.canBet()) return new ApiError("round_closed");
    this.placing = true; this.error = null; this.emit();
    const round = this.roundNo;
    try {
      const r = await getApi().game("crash", "start", { stakeCp, auto, launchIn: this.launchAt - Date.now() });
      actions.setBalance(r.balanceCp);
      if (round !== this.roundNo) return null; // the loop moved on (should not happen: bets close 1s early)
      const offset = r.serverNow - Date.now();
      // align the shared loop to the server round (shift is only the network latency, still inside the countdown)
      this.launchAt = r.launchAt - offset;
      this.bet = { id: r.id, stakeCp, auto: r.auto ?? null, offset, result: null, cashing: false, clickMult: null };
      this.placing = false; this.emit();
      return null;
    } catch (e) {
      this.placing = false; this.emit();
      return e as Error;
    }
  }

  async cashOut(): Promise<void> {
    const bet = this.bet;
    if (this.phase !== "RUNNING" || !bet || bet.result || bet.cashing) return;
    const clickAt = Date.now();                                   // ← timestamp the CLICK, not the response
    bet.cashing = true;
    bet.clickMult = floor2(crashMultAt(Math.max(0, (clickAt - this.launchAt) / 1000)));
    this.emit();
    try {
      const r = await getApi().game("crash", "cashout", { id: bet.id, at: clickAt + bet.offset });
      this.settle(r as Settled & { balanceCp: number });
    } catch (e) {
      bet.cashing = false;
      this.error = e instanceof ApiError ? e.code : "generic";
      this.emit();
    }
  }

  private async poll() {
    const bet = this.bet;
    if (!bet || this.polling || bet.result) return;
    this.polling = true; this.lastPoll = Date.now();
    try {
      const r = await getApi().game("crash", "status", { id: bet.id });
      if (r.status !== "running") this.settle(r as Settled & { balanceCp: number });
    } catch (e) {
      if (e instanceof ApiError && (e.code === "not_found" || e.code === "round_closed")) { this.bet = null; this.emit(); }
    } finally { this.polling = false; }
  }

  /** single settlement path — runs even when the Crash screen is not mounted, so balance/history stay right */
  private settle(r: Settled & { balanceCp: number }) {
    const bet = this.bet;
    if (!bet || bet.result) return;
    bet.result = { status: r.status, mult: r.mult, payoutCp: r.payoutCp, crashPoint: r.crashPoint };
    bet.cashing = false;
    actions.setBalance(r.balanceCp);
    actions.reveal("crash", r as never);
    actions.clearResume("crash");
    actions.pushHistory("crash", bet.stakeCp, r.payoutCp, r.mult);
    this.emit();
  }

  clearError() { if (this.error) { this.error = null; this.emit(); } }
}

/* ── React glue ── */
const Ctx = createContext<CrashLoop | null>(null);

export function CrashLoopProvider({ children }: { children: ReactNode }) {
  const ref = useRef<CrashLoop | null>(null);
  if (!ref.current) ref.current = new CrashLoop();
  useEffect(() => { ref.current!.start(); return () => ref.current!.stop(); }, []);
  return <Ctx.Provider value={ref.current}>{children}</Ctx.Provider>;
}
export function useCrashLoop(): CrashLoop {
  const loop = useContext(Ctx);
  if (!loop) throw new Error("useCrashLoop must be used inside <CrashLoopProvider>");
  return loop;
}
/** coarse state (phase, bet, history) — re-renders only on real changes, not every frame */
export function useCrashLoopState(): LoopSnapshot {
  const loop = useCrashLoop();
  return useSyncExternalStore(loop.subscribe, loop.getSnapshot);
}
