import { closeAdNotice, useAdNotice } from "../lib/adNotice";
import { useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";

/** Flat-dark modal that explains / reports the "click the ad" requirement. Mounted once in App. */
export default function AdClickNotice() {
  const t = useT(); const n = useAdNotice();
  if (!n) return null;
  const tap = () => { haptic.tap("light"); sfx.click(); };
  const dismiss = () => closeAdNotice();
  const primary = () => { tap(); const r = n.retry; closeAdNotice(); r?.(); };
  const req = n.kind === "required";
  const title = req ? t("adReqTitle") : n.kind === "noclick" ? t("adFailNoClickTitle") : t("adFailShortTitle");
  const body = req ? t("adReqBody") : n.kind === "noclick" ? t("adFailNoClickBody") : t("adFailShortBody");
  return (
    <div className="adn-back" onClick={dismiss} role="presentation">
      <div className="adn-card" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3 className={`adn-title ${req ? "" : "is-fail"}`}>{title}</h3>
        <p className="adn-body">{body}</p>
        <ol className="adn-steps">
          <li><b>1</b><span>{t("adStep1")}</span></li>
          <li><b>2</b><span>{t("adStep2")}</span></li>
          <li><b>3</b><span>{t("adStep3")}</span></li>
        </ol>
        <div className="adn-actions">
          <button type="button" className="btn btn-acc" onClick={primary}>{req ? t("adReqStart") : t("adRetry")}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { tap(); dismiss(); }}>{t("adClose")}</button>
        </div>
      </div>
    </div>
  );
}
