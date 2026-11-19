import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { isDemo } from "../lib/api";
import { Coin, CountUp, Icon } from "./ui";
import { sfx } from "../lib/sfx";

export type Tab = "home" | "games" | "tasks" | "wallet" | "referrals" | "profile" | "exchange" | "history";
type Main = "home" | "games" | "tasks" | "referrals" | "wallet" | "profile";

/** Sub-screens highlight the main tab they belong to. */
export const parentTab = (t: Tab): Main => (t === "exchange" ? "wallet" : t === "history" ? "profile" : t);

const go = (tab: Tab) => document.dispatchEvent(new CustomEvent("oddxs:navigate", { detail: tab }));

export function TopBar({ tab = "home" }: { tab?: Tab }) {
  const { cp, usdtBalance } = useStore();
  const t = useT();
  const labels: Record<Main, string> = { home: t("home"), games: t("games"), tasks: t("tasks"), referrals: t("referrals"), wallet: t("wallet"), profile: t("profile") };
  const section = tab === "exchange" ? t("exchange") : labels[parentTab(tab)];
  return <header className="topbar">
    <div className="tb-brand">
      <div className="tb-top">
        <div className="logo" dir="ltr" aria-label="ODDXS">ODD<b>XS</b></div>
        {isDemo() && <span className="demo-tag">{t("demo")}</span>}
      </div>
      <span className="tb-section" key={tab}>{section}</span>
    </div>
    <div className="tb-end">
      <button type="button" className="tb-chip" dir="ltr" onClick={() => { sfx.click(); go("wallet"); }} aria-label={t("pointsFull")}>
        <Coin size={24} /><CountUp value={cp / 100} decimals={2} />
      </button>
      <button type="button" className="tb-chip tb-usdt" dir="ltr" onClick={() => { sfx.click(); go("wallet"); }} aria-label="USDT">
        <span className="usdt-ico" aria-hidden="true">$</span><CountUp value={usdtBalance} decimals={4} />
      </button>
      <button type="button" className="tb-earn" onClick={() => { sfx.click(); go("home"); }} aria-label={t("earnBtn")}><Icon name="bolt" size={18} /></button>
    </div>
  </header>;
}

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const t = useT();
  const items: { id: Main; icon: string; label: string }[] = [
    { id: "home", icon: "home", label: t("home") },
    { id: "games", icon: "gamepad", label: t("games") },
    { id: "tasks", icon: "tasks", label: t("tasks") },
    { id: "referrals", icon: "users", label: t("referrals") },
    { id: "wallet", icon: "wallet", label: t("wallet") },
    { id: "profile", icon: "user", label: t("profile") },
  ];
  const active = parentTab(tab);
  return <nav className="bottom-nav" aria-label="Main navigation">
    {items.map((item) => <button type="button" key={item.id} onClick={() => { sfx.click(); onTab(item.id); }} className={`nav-item ${active === item.id ? "is-active" : ""}`} aria-current={active === item.id ? "page" : undefined}>
      <Icon name={item.icon} size={24} /><span>{item.label}</span>
    </button>)}
  </nav>;
}
