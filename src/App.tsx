import { useEffect, useState, Component, type ReactNode } from "react";
import { BottomNav, TopBar, type Tab } from "./components/Shell";
import Home from "./screens/Home";
import Games from "./screens/Games";
import Wallet from "./screens/Wallet";
import Exchange from "./screens/Exchange";
import Tasks from "./screens/Tasks";
import ForceSub from "./screens/ForceSub";
import LanguageGate from "./screens/LanguageGate";
import Referrals from "./screens/Referrals";
import Profile from "./screens/Profile";
import History from "./screens/History";
import Crash from "./games/CrashGame";
import Mines from "./games/Mines";
import Dice from "./games/Dice";
import Blackjack from "./games/Blackjack";
import GoldRush from "./games/GoldRush";
import { CrashLoopProvider } from "./lib/crashLoop";
import { initTelegram, setBackButton } from "./lib/telegram";
import { actions, useStore, type GameId } from "./lib/store";
import { useT, errKey, useLangChosen, useLangPending } from "./lib/i18n";
import { Btn, Toaster } from "./components/ui";
import AdClickNotice from "./components/AdClickNotice";
import LoadingScreen from "./components/LoadingScreen";
import { showInterstitial } from "./lib/ads";

class GameErrorBoundary extends Component<{ children: ReactNode; onBack: () => void; title: string; backLabel: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("[ODDXS] game screen failed:", error); }
  render() {
    if (this.state.failed) return <section className="page" role="alert"><h2 className="h3">{this.props.title}</h2><button type="button" className="btn btn-acc" onClick={this.props.onBack}>{this.props.backLabel}</button></section>;
    return this.props.children;
  }
}

let entryAdShown = false;

/** Keeps the splash on screen for a short minimum, then blurs it away while the app fades/blurs in underneath. */
export default function App() {
  const loading = useStore().status === "loading";
  const [minDone, setMinDone] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setMinDone(true), 1400); return () => clearTimeout(id); }, []);
  const ready = !loading && minDone;
  useEffect(() => { if (!ready) return; const id = window.setTimeout(() => setGone(true), 750); return () => clearTimeout(id); }, [ready]);
  return <>
    <div className={ready ? "app-enter" : "app-pre"}><AppInner /></div>
    {!gone && <LoadingScreen leaving={ready} />}
  </>;
}

function AppInner() {
  const t = useT();
  const s = useStore();
  const langChosen = useLangChosen();
  const langPending = useLangPending();
  const [tab, setTab] = useState<Tab>("home");
  const [game, setGame] = useState<GameId | null>(null);

  useEffect(() => { initTelegram(); actions.hydrate(); const f = () => actions.hydrate(true); window.addEventListener("oddxs:force", f); return () => window.removeEventListener("oddxs:force", f); }, []);
  // Interstitial (int-59439) once when the app is first opened, right after the account is ready.
  // Never while the force-subscribe screen is up (hooks run before the early returns below, so this must be checked here too).
  useEffect(() => { if (s.status === "ready" && !s.banned && !s.force.length && langChosen && !entryAdShown) { entryAdShown = true; void showInterstitial(); } }, [s.status, s.banned, s.force.length, langChosen]);
  useEffect(() => { setBackButton(game !== null, () => setGame(null)); document.querySelector(".app-main")?.scrollTo(0, 0); }, [game, tab]);
  useEffect(() => { const navigate = (event: Event) => { const next = (event as CustomEvent<Tab>).detail; if (next) { setGame(null); setTab(next); } }; document.addEventListener("oddxs:navigate", navigate); return () => document.removeEventListener("oddxs:navigate", navigate); }, []);

  const back = () => setGame(null);
  if (s.status === "loading") return null;
  // First run: pick a language BEFORE anything else (force-subscribe included). Shown once; changeable later in Profile.
  if (langPending) return null;
  if (!langChosen) return <LanguageGate />;
  if (s.status !== "ready") {
    const telegramGate = s.status === "error" && s.error === "open_in_telegram";
    return <div id="app-shell" className="odx-app entry-screen">
      <div className="entry-content">
        <div className="brand" dir="ltr">ODDXS</div>
        <div className="h3">{telegramGate ? t("entryWelcome") : t("entryTitle")}</div>
        <p className="muted">{telegramGate ? t("needLogin") : t(errKey(s.error ?? "generic"))}</p>
        <div className="entry-tools"><Btn onClick={() => actions.hydrate()}>{t("retry")}</Btn></div>
      </div>
    </div>;
  }
  if (s.banned) return <div id="app-shell" className="odx-app entry-screen"><div className="entry-content"><p className="muted">{t("err_banned")}</p></div></div>;
  if (s.force.length) return <ForceSub />;
  if (s.settings?.maintenance) return <div id="app-shell" className="odx-app entry-screen"><div className="entry-content"><p className="muted">{t("err_maintenance")}</p></div></div>;

  const go = (next: Tab) => { setGame(null); setTab(next); };
  // Request the game-open interstitial on every game tap (100% request rate).
  // AdsGram may still return no-fill; the game opens either way.
  const openGame = async (g: GameId) => { await showInterstitial("game_open"); setGame(g); };
  return <CrashLoopProvider><div id="app-shell" className="odx-app">
    {game !== "goldrush" && <TopBar tab={game ? "games" : tab} />}
    <main className={`app-main ${game ? "is-game" : ""}`}>
      {game && <GameErrorBoundary key={game} onBack={back} title={t("gameOpenError")} backLabel={t("gameBack")}>
        {game === "goldrush" ? <GoldRush onBack={back} /> : game === "crash" ? <Crash onBack={back} /> : game === "mines" ? <Mines onBack={back} /> : game === "dice" ? <Dice onBack={back} /> : <Blackjack onBack={back} />}
      </GameErrorBoundary>}
      {!game && tab === "home" && <Home openGame={openGame} go={go} />}
      {!game && tab === "games" && <Games openGame={openGame} />}
      {!game && tab === "tasks" && <Tasks />}
      {!game && tab === "wallet" && <Wallet onExchange={() => go("exchange")} />}
      {!game && tab === "exchange" && <Exchange onBack={() => go("wallet")} />}
      {!game && tab === "referrals" && <Referrals />}
      {!game && tab === "profile" && <Profile go={go} />}
      {!game && tab === "history" && <History />}
    </main>
    {!game && <BottomNav tab={tab} onTab={go} />}
    <Toaster />
    <AdClickNotice />
  </div></CrashLoopProvider>;
}
