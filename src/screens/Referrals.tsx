import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import Leaderboard from "../components/Leaderboard";
import { Icon } from "../components/ui";
import { isDemo } from "../lib/api";
import { sfx } from "../lib/sfx";
import { haptic } from "../lib/telegram";

export default function Referrals() {
  const s = useStore(); const t = useT(); const [copied, setCopied] = useState(false); const cfg = s.settings;
  const reward = cfg?.referral_reward_pts ?? 0, tasks = cfg?.referral_required_tasks ?? 0, ads = cfg?.referral_ads_required ?? 0;
  const link = useMemo(() => { const username = String(s.botUsername || "").replace(/^@/, "").trim(); return username && s.userId && s.userId !== "demo" ? `https://t.me/${username}?start=ref_${s.userId}` : ""; }, [s.botUsername, s.userId]);
  const copy = async () => { if (!link) return; try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link); else { const input = document.createElement("textarea"); input.value = link; input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select(); const ok = document.execCommand("copy"); input.remove(); if (!ok) throw new Error("copy_failed"); } setCopied(true); haptic.win(); sfx.coin(); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } };
  const share = () => { if (!link) return; const url = `https://t.me/share/url?url=${encodeURIComponent(link)}`; const tg = (window as any).Telegram?.WebApp; if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank", "noopener,noreferrer"); };
  return <div className="page">
    <h1 className="h1">{t("referralsTitle")}</h1>
    <p className="muted">{t("referralsIntro")}</p>
    <div className="grid-2">
      <div className="card compact"><div className="label">{t("referralsCount")}</div><div className="stat num">{s.referrals.toLocaleString()}</div></div>
      <div className="card compact"><div className="label">{t("referralReward")}</div><div className="stat num win" dir="ltr">+{reward.toLocaleString()}</div></div>
    </div>
    <h2 className="sec">{t("referralSteps")}</h2>
    <div className="list">
      <div className="list-row"><span className="step num">1</span><span className="grow"><strong>{t("referralTasks")}</strong><small className="muted block">{tasks} {t("tasks")}</small></span></div>
      <div className="list-row"><span className="step num">2</span><span className="grow"><strong>{t("referralAds")}</strong><small className="muted block">{ads} {t("watchAd")}</small></span></div>
      <div className="list-row"><span className="step num">3</span><span className="grow"><strong>{t("referralReward")}</strong><small className="muted block">{t("referralRule")}</small></span></div>
    </div>
    <h2 className="sec">{t("referralInvite")}</h2>
    <div className="card"><div className="code" dir="ltr">{link || t("referralUnavailable")}</div>
      <div className="grid-2 mt-12">
        <button type="button" className="btn btn-acc" onClick={copy} disabled={!link}><Icon name={copied ? "check" : "copy"} size={18} />{copied ? t("referralCopied") : t("referralCopy")}</button>
        <button type="button" className="btn btn-ghost" onClick={share} disabled={!link}><Icon name="send" size={18} />{t("referralShare")}</button>
      </div>
    </div>
    <h2 className="sec">{t("lbReferrals")}</h2>
    <Leaderboard kind="referrals" limit={10} />
    {isDemo() && <p className="note">{t("demoNote")}</p>}
  </div>;
}
