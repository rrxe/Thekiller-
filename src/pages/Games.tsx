import { useLanguage } from "../i18n/LanguageContext";
import UiIcons from "../components/UiIcons";
import "../styles/games.css";

type Props = { attemptsRemaining:number; freeAttempts:number; playBusy:boolean; toast:string; onPlay:()=>void; onPlayRunner:()=>void; onOpenRunnerLeaderboard:()=>void; runnerBestScore:number };
function OrbitArt({ variant }: { variant: "laser" | "runner" }) { return <div className={`game-art ${variant}`} aria-hidden="true"><span className="art-orb orb-1"/><span className="art-orb orb-2"/><span className="art-beam beam-1"/><span className="art-beam beam-2"/><span className="art-core"/><span className="art-particle p-1"/><span className="art-particle p-2"/><span className="art-particle p-3"/></div>; }
export default function Games({ attemptsRemaining, freeAttempts, playBusy, toast, onPlay, onPlayRunner, onOpenRunnerLeaderboard, runnerBestScore }: Props) {
  const { t } = useLanguage();
  const out = attemptsRemaining <= 0;
  return (
    <section className="games-page">
      <header className="games-intro"><div><span className="games-kicker">ComicX / الألعاب</span><h1>{t("games.title")}</h1><p>{t("games.subtitle")}</p></div><div className="attempt-count"><strong>{attemptsRemaining}</strong><span>محاولات</span></div></header>

      <section className="games-meter"><div><span>{t("games.attemptsLeft")}</span><b>{freeAttempts} {t("games.dailyCount", { count: freeAttempts }).replace(String(freeAttempts), "").trim()}</b></div><div className="attempt-bars">{Array.from({length: Math.min(Math.max(freeAttempts, attemptsRemaining), 6)}).map((_,i)=><i key={i} className={i < attemptsRemaining ? "on" : ""}/>)}</div>{toast ? <p>{toast}</p> : null}</section>

      <article className="game-feature">
        <OrbitArt variant="laser" />
        <div className="game-feature-copy"><span className="game-label">٠١ / سرعة</span><h2>{t("games.laserEscapeTitle")}</h2><p>{t("games.laserEscapeDesc")}</p><div className="game-tags"><span>{t("games.coinsPerWave")}</span><span>{t("games.lives")}</span></div></div>
        <button className="game-launch" onClick={onPlay} disabled={out || playBusy}><span>{playBusy ? "..." : out ? t("games.noAttemptsLeft") : t("games.playNow")}</span><b>↗</b></button>
      </article>

      <article className="game-runner">
        <div className="runner-copy"><span className="game-label">٠٢ / لا نهائي</span><h2>{t("games.cometRunTitle")}</h2><p>{t("games.cometRunDesc")}</p><div className="runner-stats"><span><b>{Math.max(0, Math.floor(runnerBestScore || 0))}</b><small>{t("games.cometRunBest", { score: Math.max(0, Math.floor(runnerBestScore || 0)) }).replace(String(Math.max(0, Math.floor(runnerBestScore || 0))), "").trim()}</small></span><span><b>{attemptsRemaining}</b><small>{t("games.attemptsLeft")}</small></span></div></div>
        <div className="runner-visual"><OrbitArt variant="runner" /></div>
        <div className="runner-actions"><button className="leaderboard-mini" onClick={onOpenRunnerLeaderboard}><UiIcons name="leaderboard"/></button><button className="runner-play" onClick={onPlayRunner} disabled={out || playBusy}>{playBusy ? "..." : out ? "—" : "العب"}</button></div>
      </article>

      <article className="game-coming"><span>03</span><div><strong>{t("games.comingSoon")}</strong><p>{t("games.comingSoonDesc")}</p></div><b>+</b></article>
    </section>
  );
}
