import type { GameId } from "../lib/store";
import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { GAME_META } from "../lib/games";
import { Icon } from "../components/ui";
import RecentBets from "../components/RecentBets";
import GameCard from "../components/GameCard";

export default function Games({ openGame }: { openGame: (game: GameId) => void }) {
  const t = useT();
  const s = useStore();
  const cfg = s.settings!;
  const items = GAME_META.filter((g) => cfg.games[g.id] !== false);
  return <div className="page">
    <div className="all-pill" aria-current="page"><Icon name="rocket" size={22} /><span>{t("allGamesChip")}</span></div>
    <div className="sec-head"><span className="sec-ico tone-blue"><Icon name="star" size={22} /></span><h2>{t("popularGames")}</h2></div>
    <div className="game-list">
      {items.map((g) => <GameCard key={g.id} imageSrc={g.banner} label={t(g.id)} tone={g.tone} onClick={() => openGame(g.id)} />)}
    </div>
    {!items.length && <p className="empty">{t("emptyGames")}</p>}
    <div className="sec-head"><span className="sec-ico tone-blue"><Icon name="history" size={22} /></span><h2>{t("recentBets")}</h2></div>
    <RecentBets limit={4} variant="result" />
  </div>;
}
