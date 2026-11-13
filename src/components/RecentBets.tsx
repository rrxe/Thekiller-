import { useStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { artOf } from "../lib/games";
import { Coin } from "./ui";

/** Compact bet rows: game art + name | bet | multiplier | result badge (green / red). */
export default function RecentBets({ limit = 4, variant = "bet" }: { limit?: number; variant?: "bet" | "result" }) {
  const t = useT();
  const { history } = useStore();
  const rows = history.slice(0, limit);
  if (!rows.length) return <p className="empty">{t("betsEmpty")}</p>;
  if (variant === "result") return <div className="bets is-result">
    {rows.map((h) => {
      const net = h.payoutCp - h.betCp, win = net >= 0 && h.mult > 0;
      return <div className="bet-line" key={h.id}>
        <span className="bet-game"><img src={artOf(h.game)} alt="" /><span>{t(h.game as any)}</span></span>
        <span className="bet-mult num" dir="ltr">{h.mult > 0 ? `${h.mult.toFixed(2)}x` : "—"}</span>
        <span className={`bet-net num ${win ? "win" : "loss"}`} dir="ltr">{net > 0 ? "+" : net < 0 ? "−" : ""}{(Math.abs(net) / 100).toFixed(2)}</span>
        <b className={`badge ${win ? "is-win" : "is-loss"}`}>{win ? t("resWon" as any) : t("resLost" as any)}</b>
      </div>;
    })}
  </div>;
  return <div className="bets">
    {rows.map((h) => {
      const net = h.payoutCp - h.betCp;
      return <div className="bet-line" key={h.id}>
        <span className="bet-game"><img src={artOf(h.game)} alt="" /><span>{t(h.game as any)}</span></span>
        <span className="bet-amt num" dir="ltr">{(h.betCp / 100).toFixed(2)}<Coin size={16} /></span>
        <span className="bet-mult num" dir="ltr">{h.mult > 0 ? `${h.mult.toFixed(2)}x` : "—"}</span>
        <b className={`badge num ${net >= 0 && h.mult > 0 ? "is-win" : "is-loss"}`} dir="ltr">{net > 0 ? "+" : net < 0 ? "−" : ""}{(Math.abs(net) / 100).toFixed(2)}</b>
      </div>;
    })}
  </div>;
}
