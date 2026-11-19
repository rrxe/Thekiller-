// Click-required rewarded ad (ported from SLY's adsgramReward.ts "pulse" flow).
// Used ONLY for Wallet (withdrawal ads) and Exchange: the user must CLICK the ad (open its link)
// and stay away from the app for at least 2.5 seconds, then come back.
//  Pulse 1: a 15 s window from the ad start (onStart) to detect the click.
//  Pulse 2: after the click, wait for the user to return; total away time must be >= 5 s.
import { ApiError } from "./api";
import { adsLocked, getAdsgramBlock } from "./ads";

export const CLICK_MIN_AWAY_MS = 2500;
const CLICK_WINDOW_MS = 15000;
const POLL_MS = 200;
const CLOSED_GRACE_MS = 1500;
const AD_START_TIMEOUT_MS = 15000;
const AD_MAX_WAIT_MS = 180000;
const AD_CLOSE_GRACE_MS = 20000;

export type ClickAdResult =
  | { status: "ok"; awayMs: number }
  | { status: "busy" | "no_click" | "away_short" | "timeout" | "unavailable"; awayMs: number };

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
let showing = false;

function createAwayTracker() {
  let total = 0, awayStart: number | null = null, leftEver = false, clickAt = 0;
  const listeners = new Set<() => void>();
  const restores: Array<() => void> = [];
  const mark = () => { if (!clickAt) clickAt = Date.now(); };
  const wrap = (obj: any, key: string) => {
    try {
      const orig = obj?.[key]; if (typeof orig !== "function") return;
      const w = function (this: any, ...a: any[]) { mark(); return orig.apply(this, a); };
      obj[key] = w; restores.push(() => { try { if (obj[key] === w) obj[key] = orig; } catch { /* ignore */ } });
    } catch { /* ignore */ }
  };
  const onMessage = (e: MessageEvent) => {
    let d: any = e.data;
    if (typeof d === "string") { if (d.indexOf("web_app_open") === -1) return; try { d = JSON.parse(d); } catch { return; } }
    if (d?.eventType === "web_app_open_link" || d?.eventType === "web_app_open_tg_link") mark();
  };
  const leave = () => { leftEver = true; if (awayStart === null) awayStart = Date.now(); };
  const back = () => { if (awayStart !== null) { total += Date.now() - awayStart; awayStart = null; } listeners.forEach((f) => f()); };
  const onVisibility = () => (document.visibilityState === "hidden" ? leave() : back());
  const onBlur = () => window.setTimeout(() => {
    if (document.hasFocus()) { leave(); back(); return; } // quick open/close of something above the app
    leave();
  }, 350);
  const onFocus = () => { if (document.visibilityState !== "hidden") back(); };
  const tg = (window as any).Telegram?.WebApp;
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", leave); window.addEventListener("pageshow", back);
  window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus);
  window.addEventListener("message", onMessage);
  wrap(tg, "openLink"); wrap(tg, "openTelegramLink"); wrap(window, "open");
  try { tg?.onEvent?.("deactivated", leave); tg?.onEvent?.("activated", back); } catch { /* ignore */ }
  return {
    isAway: () => awayStart !== null || document.visibilityState === "hidden",
    hasLeft: () => leftEver,
    hasClick: () => clickAt > 0,
    clickElapsed: () => (clickAt ? Date.now() - clickAt : 0),
    awayMs: () => total + (awayStart !== null ? Date.now() - awayStart : 0),
    waitUntilBack(maxMs: number): Promise<boolean> {
      return new Promise((resolve) => {
        if (!this.isAway()) return resolve(true);
        let done = false;
        const finish = (ok: boolean) => { if (done) return; done = true; listeners.delete(check); clearTimeout(timer); clearInterval(poll); resolve(ok); };
        const check = () => { if (document.visibilityState !== "hidden" && awayStart === null) finish(true); };
        listeners.add(check);
        const poll = window.setInterval(() => { if (document.visibilityState !== "hidden" && document.hasFocus() && awayStart !== null) back(); }, 500);
        const timer = window.setTimeout(() => finish(false), maxMs);
      });
    },
    stop() {
      listeners.clear();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", back);
      window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus);
      window.removeEventListener("message", onMessage);
      restores.forEach((f) => f()); restores.length = 0;
      try { tg?.offEvent?.("deactivated", leave); tg?.offEvent?.("activated", back); } catch { /* ignore */ }
    },
  };
}

/** Shows an interstitial and requires a click + >=2.5 s away. Never throws. */
export async function runClickInterstitial(minAwayMs: number = CLICK_MIN_AWAY_MS, waitClose = false): Promise<ClickAdResult> {
  if (showing || adsLocked()) return { status: "busy", awayMs: 0 };
  showing = true;
  const tracker = createAwayTracker();
  const listeners: Array<[string, () => void]> = [];
  let controller: any = null;
  try {
    const blockId = await getAdsgramBlock("interstitial");
    if (!blockId) return { status: "unavailable", awayMs: 0 };
    for (let i = 0; i < 20 && !(window as any).Adsgram?.init; i++) await sleep(150);
    const sdk = (window as any).Adsgram;
    if (!sdk?.init) return { status: "unavailable", awayMs: 0 };
    if (adsLocked()) return { status: "busy", awayMs: 0 };
    controller = sdk.init({ blockId, debug: false });

    let resolveStarted: (ok: boolean) => void = () => {};
    const started = new Promise<boolean>((r) => { resolveStarted = r; });
    let closed = false;
    const on = (ev: string, cb: () => void) => { controller.addEventListener?.(ev, cb); listeners.push([ev, cb]); };
    on("onStart", () => resolveStarted(true));
    on("onComplete", () => { closed = true; });
    on("onSkip", () => { closed = true; });
    on("onBannerNotFound", () => resolveStarted(false));
    on("onError", () => resolveStarted(false));
    on("onNonStopShow", () => resolveStarted(false));

    const showPromise: Promise<void> = Promise.resolve(controller.show()).then(() => {}, () => {}).then(() => { closed = true; resolveStarted(false); });

    if (!(await Promise.race([started, sleep(AD_START_TIMEOUT_MS).then(() => false)]))) return { status: "unavailable", awayMs: 0 };

    // Pulse 1: detect the click within 15 s of the ad start
    const windowEnd = Date.now() + CLICK_WINDOW_MS;
    let closedAt = 0, clicked = false;
    while (Date.now() < windowEnd) {
      if (tracker.isAway() || tracker.hasLeft() || tracker.hasClick()) { clicked = true; break; }
      if (closed) { if (!closedAt) closedAt = Date.now(); if (Date.now() - closedAt >= CLOSED_GRACE_MS) break; }
      await sleep(POLL_MS);
    }
    if (!clicked) clicked = tracker.isAway() || tracker.hasLeft() || tracker.hasClick();
    if (!clicked) {
      if (!closed) await Promise.race([showPromise, sleep(AD_CLOSE_GRACE_MS)]);
      return { status: "no_click", awayMs: 0 };
    }

    // Pulse 2: must stay away >= 2.5 s, then come back
    if (tracker.hasClick()) { const rem = minAwayMs - tracker.clickElapsed(); if (rem > 0) await sleep(rem); }
    const returned = await tracker.waitUntilBack(AD_MAX_WAIT_MS);
    const awayMs = Math.max(tracker.awayMs(), tracker.clickElapsed());
    if (!returned) return { status: "timeout", awayMs };
    if (awayMs < minAwayMs) return { status: "away_short", awayMs };
    // Optional: wait until the ad is really closed, so a follow-up ad never opens on top of it.
    if (waitClose && !closed) await Promise.race([showPromise, sleep(120000)]);
    return { status: "ok", awayMs };
  } catch {
    return { status: "unavailable", awayMs: 0 };
  } finally {
    tracker.stop();
    for (const [ev, cb] of listeners) { try { controller?.removeEventListener?.(ev, cb); } catch { /* ignore */ } }
    showing = false;
  }
}

export { ApiError };
