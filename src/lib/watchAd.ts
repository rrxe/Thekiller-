// SLY-style rewarded ad used by the Wallet (withdrawal ads) and Exchange (ad before every exchange).
// The server opens a session (prepare), we show the interstitial, the server checks the minimum watch time itself (confirm).
import { ApiError, getApi } from "./api";
import { runInterstitial, showInterstitial } from "./ads";
import { runClickInterstitial, CLICK_MIN_AWAY_MS } from "./adClick";
import { actions } from "./store";

export type WatchResult = { state: "done" | "short" | "busy" | "noclick"; rewardCp?: number };

/** purpose "reward" (Home): +points, does NOT count toward withdrawal. purpose "withdrawal" (Wallet): +points AND counts toward the withdrawal ads. purpose "exchange": gives a one-time exchange ticket, no points. */
export async function watchInt(purpose: "reward" | "exchange" | "withdrawal", minSec: number): Promise<WatchResult> {
  const api = getApi();
  const { id } = await api.intPrepare(purpose);
  let showFollowUp = false;
  try {
    if (purpose === "withdrawal" || purpose === "exchange") {
      // Withdrawal + exchange ads: the user must CLICK the ad and stay away >= 2.5 s (SLY-style pulse).
      const k = await runClickInterstitial();
      if (k.status === "unavailable") throw new ApiError("no_ads");
      if (k.status === "busy") return { state: "busy" };
      // no_click / away_short still mean the manual ad was shown and closed.
      // Don't start a second ad when the user never returned (timeout).
      showFollowUp = k.status !== "timeout";
      if (k.status === "no_click") return { state: "noclick" };
      if (k.status !== "ok" || k.awayMs < CLICK_MIN_AWAY_MS) return { state: "short" };
    } else {
      const r = await runInterstitial();
      if (r.status === "unavailable") throw new ApiError("no_ads");
      if (r.status === "busy") return { state: "busy" };
      showFollowUp = true;
      if (r.status !== "watched" || r.ms < minSec * 1000) return { state: "short" };
    }
    const c = await api.intConfirm(id);
    if (purpose !== "exchange") actions.applyTaskReward(c);
    return { state: "done", rewardCp: c.reward_cp };
  } finally {
    // Reuse the admin-configured game-open block. runInterstitial keeps its
    // ad lock held until this follow-up finishes, then releases it normally.
    if (showFollowUp) await showInterstitial("game_open");
  }
}
