// AdsGram block IDs are managed in /admin → Settings → Ads & Rewards.
// These constants are safe fallbacks for local/demo mode or before the API is reachable.
export const ADSGRAM_TASK_BLOCK = "task-59461";
export const ADSGRAM_INTERSTITIAL_BLOCK = "int-59439";
export const ADSGRAM_GAME_OPEN_BLOCK = "int-59467";

export type AdsBlockKind = "task" | "interstitial" | "game_open";
type AdsBlocks = { task: string; interstitial: string; game_open: string };
const DEFAULT_BLOCKS: AdsBlocks = {
  task: ADSGRAM_TASK_BLOCK,
  interstitial: ADSGRAM_INTERSTITIAL_BLOCK,
  game_open: ADSGRAM_GAME_OPEN_BLOCK,
};

let lastGoodBlocks: AdsBlocks = { ...DEFAULT_BLOCKS };

/** Read the latest IDs from Supabase through the server. Never cache at the HTTP layer. */
export async function getAdsgramBlock(kind: AdsBlockKind): Promise<string> {
  try {
    const response = await fetch(`/api/ads-settings?_=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data = await response.json();
      const s = data?.settings ?? {};
      const next: AdsBlocks = {
        task: typeof s.adsgram_task_block_id === "string" ? s.adsgram_task_block_id.trim() : lastGoodBlocks.task,
        interstitial: typeof s.adsgram_interstitial_block_id === "string" ? s.adsgram_interstitial_block_id.trim() : lastGoodBlocks.interstitial,
        game_open: typeof s.adsgram_game_open_block_id === "string" ? s.adsgram_game_open_block_id.trim() : lastGoodBlocks.game_open,
      };
      lastGoodBlocks = next;
    }
  } catch { /* keep the last known good values */ }
  return lastGoodBlocks[kind];
}

const interstitials: Record<string, any> = {};
let showing = false;

/**
 * Ad lock: while at least one lock is held, NO interstitial is started —
 * automatic or manual. Ref-counted: every lockAds() must be released once.
 */
let adLocks = 0;
export function lockAds(): () => void {
  adLocks += 1;
  let held = true;
  return () => { if (held) { held = false; adLocks = Math.max(0, adLocks - 1); } };
}
export const adsLocked = (): boolean => adLocks > 0;

export type IntResult = { status: "watched" | "skipped" | "unavailable" | "busy"; ms: number };

/** Shows the current admin-configured interstitial block and reports how long it stayed open. */
export async function runInterstitial(kind: "interstitial" | "game_open" = "interstitial"): Promise<IntResult> {
  if (showing || adsLocked()) return { status: "busy", ms: 0 };
  showing = true;
  const t0 = Date.now();
  try {
    const blockId = await getAdsgramBlock(kind);
    if (!blockId) return { status: "unavailable", ms: 0 };
    for (let i = 0; i < 20 && !(window as any).Adsgram?.init; i++) await new Promise((r) => window.setTimeout(r, 150));
    if (adsLocked()) return { status: "busy", ms: 0 };
    const sdk = (window as any).Adsgram;
    if (!sdk?.init) return { status: "unavailable", ms: 0 };
    const interstitial = (interstitials[blockId] ??= sdk.init({ blockId, debug: false }));
    const start = Date.now();
    const res: any = await Promise.race([interstitial.show(), new Promise((r) => window.setTimeout(() => r({ done: false }), 60000))]);
    return { status: res?.done ? "watched" : "skipped", ms: Date.now() - start };
  } catch (e: any) {
    return { status: e?.error ? "unavailable" : "skipped", ms: Date.now() - t0 };
  } finally { showing = false; }
}

/** Fire-and-forget ad: never blocks for long, never rewards. */
export async function showInterstitial(kind: "interstitial" | "game_open" = "interstitial"): Promise<void> { await runInterstitial(kind); }
