import { useState } from "react";
import { actions, useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { sfx } from "../lib/sfx";
import { Btn, Icon, LoadLine } from "../components/ui";

function openLink(url: string) {
  const w = (window as any).Telegram?.WebApp;
  try { if (w?.openTelegramLink) return w.openTelegramLink(url); } catch { /* */ }
  window.open(url, "_blank", "noopener");
}

export default function ForceSub() {
  const t = useT();
  const { force } = useStore();
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const verify = async () => { setBusy(true); setAgain(false); await actions.hydrate(true); setBusy(false); setAgain(true); };
  return (
    <div id="app-shell" className="odx-app">
      {busy && <LoadLine />}
      <div className="page force">
        <div className="brand" dir="ltr">ODDXS</div>
        <h1 className="h1">{t("forceTitle")}</h1>
        <p className="muted">{t("forceHint")}</p>
        <div className="list">
          {force.map((c) => <div key={c.id} className="list-row">
            <Icon name="shield" size={20} />
            <span className="grow ellipsis">{c.title || c.url}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { sfx.click(); openLink(c.url); }}>{t("join")}</button>
          </div>)}
        </div>
        {again && !busy && <p className="err" role="status">{t("stillMissing")}</p>}
        <Btn onClick={verify} disabled={busy}>{busy ? t("verifying") : t("verify")}</Btn>
      </div>
    </div>
  );
}
