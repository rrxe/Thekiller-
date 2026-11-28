import { useEffect, useState } from "react";
import { actions, useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { sfx } from "../lib/sfx";
import { lockAds } from "../lib/ads";
import { Icon, LoadLine } from "../components/ui";

function openLink(url: string) {
  const w = (window as any).Telegram?.WebApp;
  try { if (w?.openTelegramLink && /^https:\/\/(t|telegram)\.me\//i.test(url)) return w.openTelegramLink(url); if (w?.openLink) return w.openLink(url); } catch { /* fall through */ }
  window.open(url, "_blank", "noopener");
}

export default function ForceSub() {
  const t = useT();
  const { force } = useStore();
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  // Ad lock: no interstitial (entry / game-open / win-streak) can start while this screen is mounted.
  useEffect(() => lockAds(), []);
  const verify = async () => { sfx.click(); setBusy(true); setAgain(false); await actions.hydrate(true); setBusy(false); setAgain(true); };
  return (
    <div id="app-shell" className="odx-app">
      {busy && <LoadLine />}
      <div className="fs-page">
        <div className="fs-glow" aria-hidden="true" />
        <div className="fs-lock"><Icon name="lock" size={40} /></div>
        <div className="fs-brand" dir="ltr">ODD<b>XS</b></div>
        <h1 className="fs-title">{t("forceTitle")}</h1>
        <p className="fs-hint">{t("forceHint")}</p>

        <div className="fs-label"><span>{t("forceNeed")}</span><b className="num">{force.length}</b></div>
        <div className="fs-list">
          {force.map((c) => <div key={c.id} className="fs-ch">
            <span className="fs-ch-ico"><Icon name="send" size={20} /></span>
            <strong className="fs-ch-name">{c.title || c.url}</strong>
            <button type="button" className="fs-join" onClick={() => { sfx.click(); openLink(c.url); }}>{t("join")}</button>
          </div>)}
        </div>

        {again && !busy && <p className="fs-err" role="status"><Icon name="close" size={14} />{t("stillMissing")}</p>}
        <button type="button" className="fs-verify" onClick={verify} disabled={busy}>
          {busy ? <><span className="fs-spin" />{t("verifying")}</> : <><Icon name="check" size={18} />{t("verify")}</>}
        </button>
        <p className="fs-foot">{busy ? t("forceChecking") : t("forceJoinFirst")}</p>
      </div>
    </div>
  );
}
