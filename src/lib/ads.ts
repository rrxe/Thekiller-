// AdsGram blocks used by ODDXS.
//  • task-59461 → native Task (<adsgram-task>); the server verifies it through the AdsGram callback (see AdsgramTask.tsx).
//  • int-59439  → Interstitial: app entry (automatic, no reward) and Home "Watch Ad & Earn" (rewarded +1 point, min watch time).
//  • int-59467  → Interstitial: game open (~50% of opens, no reward).
export const ADSGRAM_TASK_BLOCK = "task-59461";
export const ADSGRAM_INTERSTITIAL_BLOCK = "int-59439";      // app-entry ad (automatic) + Home "Watch Ad & Earn" (rewarded, +1 point)
export const ADSGRAM_GAME_OPEN_BLOCK = "int-59467";        // shown when a game is opened (no reward)

const interstitials: Record<string, any> = {};
let showing = false;

export type IntResult = { status: "watched" | "skipped" | "unavailable" | "busy"; ms: number };

/** Shows an interstitial block (default int-59439) and reports how long it stayed open. Never throws. */
export async function runInterstitial(blockId: string = ADSGRAM_INTERSTITIAL_BLOCK): Promise<IntResult> {
  if (showing) return { status: "busy", ms: 0 };
  showing = true;
  const t0 = Date.now();
  try {
    for (let i = 0; i < 20 && !(window as any).Adsgram?.init; i++) await new Promise((r) => window.setTimeout(r, 150)); // SDK script loads async
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

/** Fire-and-forget ad for app entry / game open: never blocks for long, never rewards. */
export async function showInterstitial(blockId: string = ADSGRAM_INTERSTITIAL_BLOCK): Promise<void> { await runInterstitial(blockId); }
