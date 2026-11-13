import { useSyncExternalStore } from "react";
import { getApi, ApiError, type ForceChannel, type TaskClaim, type HistoryDto, type Me, type PublicSettings, type WithdrawalDto, type ExchangeDto } from "./api";
import type { GameId } from "../../shared/game-service";
import { setRate } from "./format";
import { ADSGRAM_GAME_OPEN_BLOCK, showInterstitial } from "./ads";

/** Two wins in a row (any game) → one interstitial ad, shown a moment after the result so the win animation can finish. */
let winStreak = 0;
function trackStreak(mult: number) {
  if (mult > 1) winStreak += 1; else winStreak = 0;
  if (winStreak >= 2) {
    winStreak = 0;
    window.setTimeout(() => { void showInterstitial(ADSGRAM_GAME_OPEN_BLOCK); }, 2500);
  }
}

export type { GameId } from "../../shared/game-service";
export interface FairInfo { game: GameId; serverSeed: string; commit: string; clientSeed: string; nonce: number }

interface State {
  status: "loading" | "ready" | "error";
  error: string | null;
  cp: number; adsTotal: number; intToday: number; wdAds: number; referrals: number; userId: string; banned: boolean;
  history: HistoryDto[]; withdrawals: WithdrawalDto[]; exchanges: ExchangeDto[]; usdtBalance: number; settings: PublicSettings | null;
  nextCommit: string; lastFair: FairInfo | null; resume: any; botUsername: string | null; force: ForceChannel[];
}
let state: State = {
  status: "loading", error: null, cp: 0, adsTotal: 0, intToday: 0, wdAds: 0, referrals: 0, userId: "", banned: false,
  history: [], withdrawals: [], exchanges: [], usdtBalance: 0, settings: null, nextCommit: "", lastFair: null, resume: {}, botUsername: null, force: [],
};
const subs = new Set<() => void>();
function set(p: Partial<State>) { state = { ...state, ...p }; subs.forEach((f) => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getState = () => state;
export function useStore(): State { return useSyncExternalStore(subscribe, getState); }

export const DEFAULT_SETTINGS = { min_bet_pts: 5, max_bet_pts: 500, points_per_usd: 2000, min_withdrawal_pts: 200 };

export const actions = {
  async hydrate(silent = false) {
    if (!silent) set({ status: "loading", error: null });
    try {
      const me: Me = await getApi().me();
      setRate(me.settings.points_per_usd);
      const settledCp = me.resume?.crash && me.resume.crash.status !== "running" ? me.resume.crash.balanceCp : undefined;
      set({
        status: "ready", cp: settledCp ?? me.user.balance_cp, adsTotal: me.user.ads_total, intToday: Number(me.settings.adsgram_int_today ?? 0), wdAds: me.user.withdrawal_ads_watched,
        referrals: me.user.referral_count, userId: me.user.telegram_id, banned: me.user.is_banned,
        history: me.history, withdrawals: me.withdrawals, exchanges: me.exchanges ?? [], usdtBalance: Number(me.user.usdt_balance ?? 0), settings: me.settings, nextCommit: me.resume?.nextCommit ?? "", resume: me.resume ?? {}, botUsername: me.botUsername ?? null, force: me.force && !me.force.ok ? me.force.channels : [],
      });
    } catch (e) {
      // Keep the actual failure in the WebView console so API/DB issues can be
      // diagnosed instead of presenting an unexplained generic loading error.
      console.error("[ODDXS] account bootstrap failed:", e)
      set({ status: "error", error: e instanceof ApiError ? e.code : "generic" })
    }
  },
  setBalance(cp: number | undefined) { if (typeof cp === "number") set({ cp }); },
  setNextCommit(c?: string) { if (c) set({ nextCommit: c }); },
  reveal(game: GameId, r: { serverSeed?: string; commit?: string; clientSeed?: string; nonce?: number; nextCommit?: string }) {
    if (r.serverSeed) set({ lastFair: { game, serverSeed: r.serverSeed, commit: r.commit ?? "", clientSeed: r.clientSeed ?? "", nonce: r.nonce ?? 0 } });
    if (r.nextCommit) set({ nextCommit: r.nextCommit });
  },
  pushHistory(game: GameId, betCp: number, payoutCp: number, mult: number) {
    trackStreak(mult);
    set({ history: [{ id: Date.now(), game, betCp, payoutCp, mult, ts: Date.now() }, ...state.history].slice(0, 20) });
  },
  clearResume(key: string) { const r = { ...state.resume }; delete r[key]; set({ resume: r }); },

  /** server confirmed an AdsGram task reward */
  applyTaskReward(c: TaskClaim) {
    set({ cp: c.balance_cp ?? state.cp, wdAds: c.withdrawal_ads_watched ?? state.wdAds, adsTotal: c.ads_total ?? state.adsTotal, intToday: c.int_today ?? state.intToday });
  },
  applyWithdrawal(w: WithdrawalDto, balanceCp: number) { set({ withdrawals: [w, ...state.withdrawals].slice(0, 20), cp: balanceCp, wdAds: 0 }); },
  applyExchange(x: ExchangeDto, balanceCp: number, usdtBalance: number) { set({ exchanges: [x, ...state.exchanges].slice(0, 30), cp: balanceCp, usdtBalance }); },
};
