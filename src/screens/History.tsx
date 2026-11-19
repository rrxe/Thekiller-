import { useStore } from "../lib/store";
import { useTx, useT } from "../lib/i18n";
import { fmtMult } from "../lib/format";

/** Bet history: date | game | bet | multiplier | result */
export default function History() {
  const t = useT();
  const tx = useTx();
  const { history } = useStore();
  const when = (ts: number) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  return <div className="page">
    <h1 className="h1">{tx("سجل الرهانات", "Bet history", "История ставок", "बेट हिस्ट्री")}</h1>
    {history.length === 0 ? <p className="empty">{t("betsEmpty")}</p> : <div className="table" role="table">
      <div className="tr th" role="row"><span>{tx("التاريخ", "Date", "Дата", "तारीख")}</span><span>{tx("اللعبة", "Game", "Игра", "गेम")}</span><span className="r">{t("bet")}</span><span className="r">{tx("المضاعف", "Mult", "Множ.", "मल्ट")}</span><span className="r">{tx("النتيجة", "Result", "Итог", "नतीजा")}</span></div>
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
