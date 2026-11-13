import { useMemo, useState } from "react";
import { actions, useStore } from "../lib/store";
import { ApiError, getApi, isDemo } from "../lib/api";
import { errKey, useT } from "../lib/i18n";
import { CountUp, Icon, Sheet } from "../components/ui";
import { fmtPts } from "../lib/format";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";

export default function Exchange({ onBack }: { onBack: () => void }) {
  const t = useT();
  const s = useStore();
  const cfg = s.settings!;
  const [amountText, setAmountText] = useState(String(cfg.exchange_min_pts));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [complete, setComplete] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);

  const amount = useMemo(() => { const n = Number(amountText); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }, [amountText]);
  const rate = Math.max(1, Number(cfg.exchange_points_per_usdt) || 2000);
  const receive = Number((amount / rate).toFixed(8));
  const points = s.cp / 100;
  const canExchange = cfg.exchange_enabled && !busy && amount >= cfg.exchange_min_pts && amount <= cfg.exchange_max_pts && amount <= points;
  const validation = amount > points ? t("notEnough") : amount > cfg.exchange_max_pts ? t("err_exchange_max") : amount > 0 && amount < cfg.exchange_min_pts ? t("err_exchange_min") : "";
  const quick = [cfg.exchange_min_pts, Math.max(cfg.exchange_min_pts, 500), Math.max(cfg.exchange_min_pts, 1000), Math.min(cfg.exchange_max_pts, Math.floor(points))]
    .filter((n, i, a) => n > 0 && n <= points && a.indexOf(n) === i).slice(0, 4);

  const convert = async () => {
    if (!canExchange) return;
    setBusy(true); setError("");
    try {
      const r = await getApi().exchange(amount);
      actions.applyExchange(r.exchange, r.balance_cp, r.usdt_balance);
      setSuccessAmount(r.exchange.usdt); setComplete(true); setConfirm(false); haptic.win(); sfx.win();
      setAmountText(String(cfg.exchange_min_pts));
    } catch (e) { setError(t(errKey(e instanceof ApiError ? e.code : "generic"))); setConfirm(false); }
    finally { setBusy(false); }
  };

  return <div className="page">
    <div className="page-head">
      <button type="button" className="icon-btn rtl-flip" onClick={onBack} aria-label={t("back")}><Icon name="back" size={20} /></button>
      <h1 className="h1">{t("exchangeTitle")}</h1>
    </div>
    <p className="muted">{t("exchangeIntro")}</p>

    <div className="grid-2">
      <div className="card compact"><div className="label">{t("balance")}</div><div className="stat num" dir="ltr">{points.toLocaleString()}<small> {t("points")}</small></div></div>
      <div className="card compact"><div className="label">{t("usdtBalance")}</div><div className="stat num" dir="ltr"><CountUp value={s.usdtBalance} decimals={4} /></div></div>
    </div>

    <section className="card">
      <div className="row-between"><span className="label">{t("exchangeAmount")}</span><span className="muted num" dir="ltr">{rate.toLocaleString()} = 1 USDT</span></div>
      <div className="bet-row mt-8" dir="ltr">
        <label className="bet-input"><input aria-label={t("exchangeAmount")} inputMode="numeric" className="input num" placeholder="0" value={amountText} onChange={(e) => { setError(""); setAmountText(e.target.value.replace(/[^0-9]/g, "").slice(0, 10)); }} /><span>PTS</span></label>
        <button type="button" className="sq wide-sq" onClick={() => setAmountText(String(Math.min(cfg.exchange_max_pts, Math.floor(points))))}>MAX</button>
      </div>
      {quick.length > 0 && <div className="chips-row mt-8" dir="ltr">{quick.map((q) => <button type="button" key={q} className={`chip ${amount === q ? "is-active" : ""}`} onClick={() => setAmountText(String(q))}>{q.toLocaleString()}</button>)}</div>}
      <div className="kv mt-12"><span className="muted">{t("exchangeMin")} / {t("exchangeMax")}</span><b className="num" dir="ltr">{cfg.exchange_min_pts.toLocaleString()} / {cfg.exchange_max_pts.toLocaleString()}</b></div>
      <div className="kv"><span className="muted">USDT</span><b className="num" dir="ltr">≈ {receive.toFixed(4)}</b></div>
      {error && <p className="err">{error}</p>}
      {!error && validation && <p className="hint">{validation}</p>}
      {!cfg.exchange_enabled && <p className="hint">{t("exchangeDisabled")}</p>}
      <button type="button" className="btn btn-acc mt-12" disabled={!canExchange} onClick={() => { setError(""); setConfirm(true); sfx.click(); }}>{t("exchangeNow")}</button>
      <p className="hint-sm">{t("exchangeDisclaimer")}</p>
    </section>

    <h2 className="sec">{t("exchangeHistory")}</h2>
    {s.exchanges.length === 0 ? <p className="empty">{t("noExchanges")}</p> : <div className="list">
      {s.exchanges.slice(0, 12).map((x) => <div className="list-row" key={x.id}>
        <span className="grow"><strong className="num" dir="ltr">{x.usdt.toFixed(4)} USDT</strong><small className="muted block num">{fmtPts(x.points * 100)} {t("points")} · {new Date(x.created_at).toLocaleString()}</small></span>
        <b className="num win" dir="ltr">+{x.usdt.toFixed(4)}</b>
      </div>)}
    </div>}
    {isDemo() && <p className="note">{t("demoNote")}</p>}

    <Sheet open={confirm || complete} onClose={() => !busy && (setConfirm(false), setComplete(false))}>
      {complete ? <div className="sheet-center"><h3 className="h3">{t("exchangeSuccess")}</h3><div className="stat-lg num win" dir="ltr">+{successAmount.toFixed(4)} USDT</div><button type="button" className="btn btn-acc" onClick={() => setComplete(false)}>{t("ok")}</button></div>
        : <div className="sheet-center"><h3 className="h3">{t("exchangeConfirm")}</h3><p className="muted num" dir="ltr">{amount.toLocaleString()} {t("points")} → {receive.toFixed(4)} USDT</p>
          <div className="grid-2"><button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>{t("cancel")}</button><button type="button" className="btn btn-acc" disabled={busy || !canExchange} onClick={convert}>{busy ? t("submitting") : t("exchangeConfirm")}</button></div></div>}
    </Sheet>
  </div>;
}
