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
    <header className="pg-head">
      <span className="kicker">{t("refKicker")}</span>
      <h1 className="pg-title">{t("referralsTitle")}</h1>
      <p className="pg-intro">{t("referralsIntro")}</p>
    </header>

    <div className="stat-grid">
      <div className="stat-card"><span className="sc-ico"><Icon name="users" size={20} /></span><span className="label">{t("referralsCount")}</span><b className="sc-val num">{s.referrals.toLocaleString()}</b></div>
      <div className="stat-card is-gold"><span className="sc-ico"><Icon name="gift" size={20} /></span><span className="label">{t("referralReward")}</span><b className="sc-val num" dir="ltr">+{reward.toLocaleString()}<small>{t("points")}</small></b></div>
    </div>

    <section className="invite-card">
      <div className="ic-head">
        <span className="ic-ico"><Icon name="link" size={20} /></span>
        <div><small className="label block">{t("referralInvite")}</small><h2 className="ic-title">{t("inviteEarn")}</h2></div>
      </div>
      <div className="link-row">
        <div className="link-box" dir="ltr">{link || t("referralUnavailable")}</div>
        <button type="button" className={`copy-btn ${copied ? "is-done" : ""}`} onClick={copy} disabled={!link} aria-label={t("referralCopy")}><Icon name={copied ? "check" : "copy"} size={18} /></button>
      </div>
      <button type="button" className="btn btn-acc btn-lg" onClick={share} disabled={!link}><Icon name="send" size={18} />{t("referralShare")}</button>
      <p className="ic-note" aria-live="polite">{copied ? t("referralCopied") : t("referralRule")}</p>
    </section>

    <h2 className="sec">{t("referralSteps")}</h2>
    <ol className="timeline">
      <li><span className="tl-dot num">1</span><div className="tl-body"><strong>{t("referralStepOne")}</strong></div></li>
      <li><span className="tl-dot num">2</span><div className="tl-body"><strong>{t("referralStepTwo")}</strong>
        <div className="req-row"><small className="label">{t("refNeeds")}</small>
          <span className="req-chip"><Icon name="tasks" size={14} />{tasks} {t("tasks")}</span>
          <span className="req-chip"><Icon name="play" size={12} />{ads} {t("watchAd")}</span>
        </div></div></li>
      <li><span className="tl-dot is-final"><Icon name="check" size={14} /></span><div className="tl-body"><strong>{t("referralStepThree")}</strong><small className="muted block num" dir="ltr">+{reward.toLocaleString()} {t("points")}</small></div></li>
    </ol>

    <h2 className="sec">{t("lbReferrals")}</h2>
    <Leaderboard kind="referrals" limit={10} />
    {isDemo() && <p className="note">{t("demoNote")}</p>}
  </div>;
}
