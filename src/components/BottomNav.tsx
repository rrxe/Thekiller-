import "../styles/bottomnav.css";
import UiIcons from "./UiIcons";
import type { Page } from "../App";
import { useLanguage } from "../i18n/LanguageContext";

type Props = { page: Page; setPage: (page: Page) => void };

export default function BottomNav({ page, setPage }: Props) {
  const { t } = useLanguage();
  const items: { id: Page; label: string; icon: "home" | "tasks" | "referrals" | "profile" }[] = [
    { id: "home", label: t("bottomnav.home"), icon: "home" },
    { id: "tasks", label: t("bottomnav.tasks"), icon: "tasks" },
    { id: "referrals", label: t("bottomnav.referrals"), icon: "referrals" },
    { id: "profile", label: t("bottomnav.profile"), icon: "profile" },
  ];
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const active = page === item.id;
        return (
          <button key={item.id} type="button" className={`nav-item${active ? " active" : ""}`} onClick={() => setPage(item.id)} aria-current={active ? "page" : undefined}>
            <span className="nav-indicator" />
            <span className="nav-icon-box"><UiIcons name={item.icon} className="nav-icon" /></span>
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
