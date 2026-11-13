import { useStore } from "../lib/store";
import { Lang, setLang, useLang, useT } from "../lib/i18n";
import { CountUp, Icon } from "../components/ui";
import { sfx } from "../lib/sfx";
import type { Tab } from "../components/Shell";

export default function Profile({ go }: { go: (t: Tab) => void }) {
  const t = useT(); const lang = useLang(); const s = useStore();
  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  const displayName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ") || (tgUser?.username ? `@${tgUser.username}` : "ODDXS");
  const ar = lang === "ar";
  return <div className="page">
    <section className="card profile-head">
      {tgUser?.photo_url ? <img className="avatar" src={tgUser.photo_url} alt="" /> : <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>}
      <div className="grow"><strong>{displayName}</strong><small className="muted block">{tgUser?.username ? `@${tgUser.username} · ` : ""}ID <span className="num" dir="ltr">{s.userId || "—"}</span></small></div>
    </section>

    <div className="grid-2">
      <div className="card compact"><div className="label">{t("adsWatched")}</div><div className="stat num"><CountUp value={s.adsTotal} decimals={0} /></div></div>
      <div className="card compact"><div className="label">{t("invited")}</div><div className="stat num">{s.referrals}</div></div>
      <div className="card compact"><div className="label">{t("requests")}</div><div className="stat num">{s.withdrawals.length}</div></div>
    </div>

    <div className="list mt-16">
      <button type="button" className="list-row as-btn" onClick={() => go("history")}><Icon name="history" size={20} /><span className="grow">{ar ? "سجل الرهانات" : "Bet history"}</span><Icon name="chevron" size={16} className="rtl-flip dim" /></button>
      <button type="button" className="list-row as-btn" onClick={() => go("referrals")}><Icon name="users" size={20} /><span className="grow">{t("referralsTitle")}</span><Icon name="chevron" size={16} className="rtl-flip dim" /></button>
      <button type="button" className="list-row as-btn" onClick={() => go("tasks")}><Icon name="tasks" size={20} /><span className="grow">{t("tasks")}</span><Icon name="chevron" size={16} className="rtl-flip dim" /></button>
    </div>

    <h2 className="sec">{t("preferences")}</h2>
    <div className="list">
      <div className="list-row"><span className="grow"><strong>{t("language")}</strong><small className="muted block">{t("languageDescription")}</small></span>
        <button type="button" className="chip" onClick={() => { sfx.click(); setLang((lang === "ar" ? "en" : "ar") as Lang); }}>{lang === "ar" ? "عربي → EN" : "EN → عربي"}</button></div>
    </div>
  </div>;
}
