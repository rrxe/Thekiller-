import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import UiIcons from "../components/UiIcons";
import "../styles/referrals.css";

interface ReferralsProps { telegramId:string; referralsCount:number; referralRewardUsdt:number; referralRequiredTasks:number; }
export default function Referrals({telegramId,referralsCount,referralRewardUsdt,referralRequiredTasks}:ReferralsProps){
  const {t}=useLanguage(); const [copied,setCopied]=useState(false); const botUsername="SLYMintX_bot"; const appShortName="start"; const referralLink=telegramId?`https://t.me/${botUsername}/${appShortName}?startapp=ref_${telegramId}`:"";
  const progress=Math.min(1, referralsCount/Math.max(1,10));
  const handleCopy=async()=>{if(!referralLink)return;try{await navigator.clipboard.writeText(referralLink);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{}};
  return <section className="referrals-page">
    <header className="referrals-intro"><div><span className="referrals-kicker">COMICX / REFERRALS</span><h1>{t("referrals.title")}</h1><p>{t("referrals.description",{tasks:referralRequiredTasks,reward:referralRewardUsdt})}</p></div><div className="referral-counter"><strong>{referralsCount}</strong><span>{t("referrals.qualifiedReferrals")}</span></div></header>

    <section className="invite-stage"><div className="invite-stage-copy"><span className="invite-label">YOUR NETWORK</span><strong>{referralsCount}</strong><small>{t("referrals.qualifiedReferrals")}</small><div className="invite-progress"><i style={{width:`${progress*100}%`}}/></div></div><div className="network-orbit" aria-hidden="true"><span/><span/><span/><b>C<span>X</span></b></div></section>

    <section className="referral-facts"><div><span>REWARD</span><strong>{referralRewardUsdt} <small>USDT</small></strong></div><div><span>REQUIREMENT</span><strong>{referralRequiredTasks} <small>TASKS</small></strong></div><div><span>STATUS</span><strong>{referralsCount>0?"ACTIVE":"START"}</strong></div></section>

    <section className="share-panel"><div className="share-heading"><div><span>{t("referrals.linkLabel")}</span><h2>INVITE FROM COMICX</h2></div><UiIcons name="referrals"/></div><div className="share-row"><input readOnly value={referralLink} placeholder={telegramId?t("referrals.linkUnavailable"):t("referrals.linkUnavailable")}/><button onClick={handleCopy} disabled={!referralLink}>{copied?t("referrals.copied"):t("referrals.copy")}</button></div><p>Copy your referral link and share it with new users.</p></section>

    <section className="steps-panel"><div className="steps-heading"><span>STEPS</span><strong>3 SIMPLE STEPS</strong></div><div className="steps-line"/><div className="ref-step"><b>01</b><div><strong>SHARE</strong><p>{t("referrals.linkLabel")}</p></div></div><div className="ref-step"><b>02</b><div><strong>COMPLETE</strong><p>{t("referrals.requirementBody",{tasks:referralRequiredTasks})}</p></div></div><div className="ref-step"><b>03</b><div><strong>EARN</strong><p>{t("referrals.description",{tasks:referralRequiredTasks,reward:referralRewardUsdt})}</p></div></div></section>
  </section>;
}
