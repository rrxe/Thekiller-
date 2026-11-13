import { useEffect, useRef, useState } from "react";
import { ADSGRAM_TASK_BLOCK } from "../lib/ads";
import { actions, useStore } from "../lib/store";
import { getApi } from "../lib/api";
import { useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { toast } from "../lib/toast";
import { Icon } from "./ui";

/**
 * AdsGram native Task (task-59461).
 * 1. The user completes the task inside the AdsGram widget.
 * 2. AdsGram calls our server (/api/auth/me?secret=…&userid=…&kind=native_task) → a PENDING event is stored.
 * 3. This component asks the server to claim it (polling a few times because the callback can arrive late).
 * The balance only ever changes on the server; the client just displays what it returns.
 */
export default function AdsgramTask({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const reward = useStore().settings?.adsgram_task_reward_pts ?? 1;
  const el = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const [unavailable, setUnavailable] = useState(false);

  const claim = (attempt = 0) => {
    if (attempt === 0) { if (busy.current) return; busy.current = true; }
    getApi().adsgramClaim().then((r) => {
      if (r.ok && r.pending === false && typeof r.reward_cp === "number") {
        busy.current = false;
        actions.applyTaskReward(r); haptic.win(); sfx.coin();
        toast(`+${(r.reward_cp / 100).toFixed(2)} ${t("points")}`);
        onDone?.();
        return;
      }
      retry(attempt);
    }).catch(() => retry(attempt));
  };
  const retry = (attempt: number) => {
    if (attempt >= 15) { busy.current = false; return; }
    timer.current = window.setTimeout(() => claim(attempt + 1), 2000);
  };

  useEffect(() => {
    const node = el.current; if (!node) return;
    const onReward = () => claim();
    const onMissing = () => setUnavailable(true);
    node.addEventListener("reward", onReward);
    node.addEventListener("onBannerNotFound", onMissing);
    return () => { node.removeEventListener("reward", onReward); node.removeEventListener("onBannerNotFound", onMissing); window.clearTimeout(timer.current); busy.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The widget renders its title inside a shadow root, so page CSS can't reach it. If the root is open, inject a stylesheet so long
  // titles wrap onto new lines instead of stretching the row / pushing the button out of the card.
  useEffect(() => {
    const node = el.current; if (!node) return;
    const css = `:host{display:block;width:100%;max-width:100%}
      *{min-width:0;box-sizing:border-box}
      [class*="title" i],[class*="name" i],[class*="text" i],[class*="label" i],[class*="desc" i]{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}
      [class*="button" i],[class*="action" i]{flex-shrink:0;max-width:100%;box-sizing:border-box}`;
    const apply = () => { const root = node.shadowRoot; if (!root) return; if (!root.querySelector("style[data-oddxs]")) { const st = document.createElement("style"); st.setAttribute("data-oddxs", ""); st.textContent = css; root.appendChild(st); } };
    apply();
    const id = window.setInterval(apply, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 15000);
    return () => { window.clearInterval(id); window.clearTimeout(stop); };
  }, [unavailable]);

  if (unavailable) return <div className="at-empty"><Icon name="history" size={18} /><span>{t("adTaskUnavailable")}</span></div>;
  return <adsgram-task ref={el} data-block-id={ADSGRAM_TASK_BLOCK} data-debug="false" className="at-widget">
    <span slot="reward" className="at-reward" dir="ltr">+{reward}</span>
    <div slot="button" className="at-btn">{t("adOpen")}</div>
    <div slot="claim" className="at-btn is-claim" onClick={() => claim()}>{t("claim")}</div>
    <div slot="done" className="at-btn is-done">{t("taskDone")}</div>
  </adsgram-task>;
}
