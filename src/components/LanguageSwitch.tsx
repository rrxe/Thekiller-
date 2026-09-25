import "../styles/language.css";

export default function LanguageSwitch() {
  return (
    <section className="language-switch-card" aria-label="اللغة">
      <div className="language-switch-head">
        <p>لغة التطبيق</p>
        <span>واجهة عربية بالكامل</span>
      </div>
      <div className="language-switch-row">
        <button type="button" className="language-switch-btn active" aria-pressed="true">
          العربية
        </button>
      </div>
    </section>
  );
}
