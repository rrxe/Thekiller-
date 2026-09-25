import "../styles/topbar.css";
import UiIcons from "./UiIcons";
import type { Page } from "../App";
import { useLanguage } from "../i18n/LanguageContext";

type Props = { page: Page; coins: number; usdt: number };

export default function TopBar({ page, coins, usdt }: Props) {
  const { t } = useLanguage();
  const titles: Record<Page, { label: string; sub: string }> = {
    home: { label: "ComicX", sub: t("topbar.home.sub") },
    tasks: { label: t("topbar.tasks.label"), sub: t("topbar.tasks.sub") },
    referrals: { label: t("topbar.referrals.label"), sub: t("topbar.referrals.sub") },
    profile: { label: t("topbar.profile.label"), sub: t("topbar.profile.sub") },
  };
  const current = titles[page];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-avatar">C<span>X</span></div>
        <div className="topbar-copy">
          <strong>{current.label}</strong>
          <span>{current.sub}</span>
        </div>
      </div>

      <div className="topbar-wallet">
        <div className="topbar-balance coins">
          <UiIcons name="coins" className="topbar-balance-icon" />
          <div><span>{t("topbar.coins")}</span><strong>{coins.toLocaleString()}</strong></div>
        </div>
        <div className="topbar-balance cash">
          <UiIcons name="withdraw" className="topbar-balance-icon" />
          <div><span>{t("topbar.usdt")}</span><strong>{usdt.toFixed(4)}</strong></div>
        </div>
      </div>
    </header>
  );
}
