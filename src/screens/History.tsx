import { useStore } from "../lib/store";
import { useLang, useT } from "../lib/i18n";
import { fmtMult } from "../lib/format";

/** Bet history: date | game | bet | multiplier | result */
export default function History() {
  const t = useT();
  const lang = useLang();
  const { history } = useStore();
  const ar = lang === "ar";
  const when = (ts: number) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  return <div className="page">
    <h1 className="h1">{ar ? "سجل الرهانات" : "Bet history"}</h1>
    {history.length === 0 ? <p className="empty">{ar ? "ماكو رهانات لحد الآن." : "No bets yet."}</p> : <div className="table" role="table">
      <div className="tr th" role="row"><span>{ar ? "التاريخ" : "Date"}</span><span>{ar ? "اللعبة" : "Game"}</span><span className="r">{t("bet")}</span><span className="r">{ar ? "المضاعف" : "Mult"}</span><span className="r">{ar ? "النتيجة" : "Result"}</span></div>
      {history.map((h) => { const net = h.payoutCp - h.betCp; return <div className="tr" role="row" key={h.id}>
        <span className="muted num" dir="ltr">{when(h.ts)}</span>
        <span>{t(h.game as any)}</span>
        <span className="r num" dir="ltr">{(h.betCp / 100).toFixed(2)}</span>
        <span className="r num" dir="ltr">{h.mult > 0 ? fmtMult(h.mult) : "—"}</span>
        <b className={`r num ${net > 0 ? "win" : net < 0 ? "loss" : ""}`} dir="ltr">{net > 0 ? "+" : net < 0 ? "−" : ""}{(Math.abs(net) / 100).toFixed(2)}</b>
      </div>; })}
    </div>}
  </div>;
}
