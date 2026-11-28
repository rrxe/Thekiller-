import { useEffect, useState } from "react";
import { LANGS, setLang, useLang, type Lang } from "../lib/i18n";
import { sfx } from "../lib/sfx";
import { lockAds } from "../lib/ads";
import { Icon } from "../components/ui";

/**
 * First-run language picker. Shown once, before the force-subscribe screen.
 * One tap on a language = saved + entered; it never shows again (change it later from Profile).
 * The headline is shown in all four languages so it is understandable whatever the user reads.
 */
export default function LanguageGate() {
  const current = useLang(); // pre-selected from the Telegram language (not "chosen" yet)
  const [picked, setPicked] = useState<Lang | null>(null);
  // No interstitial may start behind this screen.
  useEffect(() => lockAds(), []);

  const choose = (code: Lang) => {
    if (picked) return;
    sfx.click();
    setPicked(code);
    // tiny delay so the tap feedback is visible before the screen leaves
    window.setTimeout(() => setLang(code), 260);
  };

  return (
    <div id="app-shell" className="odx-app">
      <div className="lg-page">
        <div className="fs-glow" aria-hidden="true" />
        <div className="lg-globe" aria-hidden="true"><Icon name="globe" size={38} /></div>
        <div className="fs-brand" dir="ltr">ODD<b>XS</b></div>

        <h1 className="lg-title">
          <span lang="ar" dir="rtl">اختر لغتك</span>
          <span lang="en" dir="ltr">Choose your language</span>
          <span lang="ru" dir="ltr">Выберите язык</span>
          <span lang="hi" dir="ltr">अपनी भाषा चुनें</span>
        </h1>

        <div className="lg-list" role="radiogroup" aria-label="Language">
          {LANGS.map((l, i) => {
            const on = (picked ?? current) === l.code;
            return (
              <button key={l.code} type="button" role="radio" aria-checked={on} disabled={!!picked && picked !== l.code}
                className={`lg-card ${on ? "is-on" : ""} ${picked === l.code ? "is-picked" : ""}`} style={{ animationDelay: `${i * 70}ms` }}
                onClick={() => choose(l.code)}>
                <span className="lg-glyph" aria-hidden="true">{l.glyph}</span>
                <span className="lg-text">
                  <strong lang={l.code} dir={l.dir}>{l.native}</strong>
                  <small dir="ltr">{l.english}</small>
                </span>
                <span className="lg-tick" aria-hidden="true"><Icon name="check" size={16} /></span>
              </button>
            );
          })}
        </div>

        <p className="fs-foot lg-foot" dir="ltr">You can change it anytime in Profile</p>
      </div>
    </div>
  );
}
