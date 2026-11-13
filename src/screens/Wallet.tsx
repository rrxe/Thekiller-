import { useMemo, useState } from "react";
import { actions, useStore } from "../lib/store";
import { ApiError, getApi, isDemo } from "../lib/api";
import { fmtPts, fmtUsd } from "../lib/format";
import { errKey, useLang, useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { CountUp, Icon, Sheet } from "../components/ui";

type Method = "gram" | "binance";
type Cur = "pts" | "usdt";
export default function Wallet({ onExchange }: { onExchange: () => void }) {
  const t = useT(); const lang = useLang(); const s = useStore(); const cfg = s.settings!; const pts = s.cp / 100;
  const methods = ([cfg.gram_enabled && "gram", cfg.binance_enabled && "binance"].filter(Boolean) as Method[]);
  const [cur, setCur] = useState<Cur>("pts");
  const [open, setOpen] = useState(false); const [method, setMethod] = useState<Method>(methods[0] ?? "gram");
  const [amount, setAmount] = useState(String(cfg.min_withdrawal_pts)); const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false); const [filter, setFilter] = useState<"all" | "withdrawal" | "exchange" | "game">("all");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(false);
  const adsLeft = Math.max(0, cfg.withdrawal_ads_required - s.wdAds); const pending = s.withdrawals.some((w) => w.status === "pending");
  const canOpen = pts >= cfg.min_withdrawal_pts && adsLeft === 0 && !pending && methods.length > 0;
  const submit = async () => {
    const value = Math.floor(parseFloat(amount)); setErr("");
    if (!Number.isFinite(value)) return setErr(t("err_bad_amount"));
    setBusy(true);
    try { const result = await getApi().withdraw(value, method, target.trim()); actions.applyWithdrawal(result.withdrawal, result.balance_cp); setOk(true); haptic.win(); sfx.win(); }
    catch (e) { const code = e instanceof ApiError ? e.code : "generic"; setErr(t(errKey(code)) + (e instanceof ApiError && e.detail && /^\d+$/.test(e.detail) && ["withdraw_min", "withdraw_max", "need_ads"].includes(code) ? ` (${e.detail})` : "")); }
    finally { setBusy(false); }
  };
  const close = () => { setOpen(false); setOk(false); setErr(""); setTarget(""); };
  const unlockPct = Math.min(100, (pts / Math.max(1, cfg.min_withdrawal_pts)) * 100);
  const activity = useMemo(() => [
    ...s.withdrawals.map((w) => ({ id: `w-${w.id}`, kind: "withdrawal" as const, ts: Date.parse(w.created_at) || 0, title: t("withdraw"), detail: `${w.method === "gram" ? t("methodGram") : t("methodBinance")} · ${w.target}`, amount: `−${fmtPts(w.amount_cp)}`, tone: w.status === "paid" ? "win" : w.status === "rejected" ? "loss" : "", status: t(`status_${w.status}` as any) })),
    ...s.exchanges.map((x) => ({ id: `x-${x.id}`, kind: "exchange" as const, ts: Date.parse(x.created_at) || 0, title: t("exchange"), detail: `+${x.usdt.toFixed(4)} USDT`, amount: `−${fmtPts(x.points * 100)}`, tone: "", status: t("exchangeSuccess") })),
    ...s.history.map((h) => { const net = h.payoutCp - h.betCp; return { id: `g-${h.id}`, kind: "game" as const, ts: h.ts, title: t(h.game as any), detail: `${fmtPts(h.betCp)} · ${h.mult.toFixed(2)}×`, amount: `${net > 0 ? "+" : net < 0 ? "−" : ""}${fmtPts(Math.abs(net))}`, tone: net > 0 ? "win" : net < 0 ? "loss" : "", status: "" }; }),
  ].sort((a, b) => b.ts - a.ts).slice(0, 30), [s.withdrawals, s.exchanges, s.history, t]);
  const visible = filter === "all" ? activity : activity.filter((a) => a.kind === filter);
  const tabs = [["all", lang === "ar" ? "الكل" : "All"], ["withdrawal", t("withdraw")], ["exchange", t("exchange")], ["game", t("games")]] as const;

  return <div className="page">
    <section className="card">
      <div className="row-between">
        <span className="label">{t("balance")}</span>
        <div className="seg" role="tablist" dir="ltr">
          {(["pts", "usdt"] as Cur[]).map((c) => <button type="button" key={c} role="tab" aria-selected={cur === c} className={cur === c ? "is-active" : ""} onClick={() => { sfx.tick(); setCur(c); }}>{c === "pts" ? "PTS" : "USDT"}</button>)}
        </div>
      </div>
      <div className="balance-main num" dir="ltr">
        {cur === "pts" ? <><CountUp value={pts} decimals={2} /><small>{t("points")}</small></> : <><CountUp value={s.usdtBalance} decimals={4} /><small>USDT</small></>}
      </div>
      <div className="balance-sub num" dir="ltr">{cur === "pts" ? `≈ ${fmtUsd(pts)}` : `${pts.toFixed(2)} ${t("points")}`}</div>
      <div className="grid-2 mt-12">
        <button type="button" className="btn btn-acc" onClick={() => { sfx.click(); onExchange(); }}><Icon name="repeat" size={18} />{t("exchangeNow")}</button>
        <button type="button" className="btn btn-ghost" disabled={!canOpen} onClick={() => { sfx.click(); setOpen(true); }}><Icon name="arrow-up-right" size={18} />{t("withdraw")}</button>
      </div>
    </section>

    <section className="card">
      <div className="kv"><span className="muted">{t("exchangeRate")}</span><b className="num" dir="ltr">{Number(cfg.exchange_points_per_usdt || 2000).toLocaleString()} = 1 USDT</b></div>
      <div className="kv"><span className="muted">{t("minWithdrawLbl")}</span><b className="num" dir="ltr">{cfg.min_withdrawal_pts.toLocaleString()} · {fmtUsd(cfg.min_withdrawal_pts)}</b></div>
      <div className="kv"><span className="muted">{t("maxWithdrawLbl")}</span><b className="num" dir="ltr">{cfg.max_withdrawal_pts.toLocaleString()} · {fmtUsd(cfg.max_withdrawal_pts)}</b></div>
      <div className="bar mt-12"><i style={{ width: `${unlockPct}%` }} /></div>
      <div className="row-between mt-8"><span className="hint-sm num" dir="ltr">{Math.floor(pts).toLocaleString()} / {cfg.min_withdrawal_pts.toLocaleString()}</span>{cfg.withdrawal_ads_required > 0 && <span className="hint-sm num" dir="ltr">{t("adsProgress")} {s.wdAds}/{cfg.withdrawal_ads_required}</span>}</div>
      <p className="hint">{pending ? t("err_pending_exists") : adsLeft > 0 ? `${t("adsNeeded")} (${adsLeft})` : pts < cfg.min_withdrawal_pts ? `${Math.ceil(cfg.min_withdrawal_pts - pts)} ${t("withdrawMore")}` : t("pendingNote")}</p>
    </section>
    {isDemo() && <p className="note">{t("demoNote")}</p>}
    {cfg.payment_note && <p className="note">{cfg.payment_note}</p>}

    <h2 className="sec">{t("walletActivity")}</h2>
    <div className="tabs" role="tablist">{tabs.map(([k, label]) => <button type="button" key={k} role="tab" aria-selected={filter === k} className={`tab ${filter === k ? "is-active" : ""}`} onClick={() => setFilter(k)}>{label}</button>)}</div>
    {!activity.length ? <p className="empty">{t("noWalletActivity")}</p> : visible.length === 0 ? <p className="empty">{lang === "ar" ? "ماكو نشاط بهذا التصنيف" : "No activity in this category"}</p> : <div className="list flat">
      {visible.map((a) => <div className="list-row tx" key={a.id}>
        <span className="grow"><strong>{a.title}</strong><small className="muted block">{a.detail}</small><small className="dim block num">{new Date(a.ts).toLocaleString()}</small></span>
        <span className="tx-end"><b className={`num ${a.tone}`} dir="ltr">{a.amount}</b>{a.status && <small className={`muted ${a.tone}`}>{a.status}</small>}</span>
      </div>)}
    </div>}

    <Sheet open={open} onClose={() => !busy && close()}>
      {ok ? <div className="sheet-center"><h3 className="h3">{t("requestSent")}</h3><p className="muted">{t("pendingNote")}</p><button type="button" className="btn btn-acc" onClick={close}>{t("ok")}</button></div> : <div className="form">
        <h3 className="h3">{t("withdraw")}</h3>
        <div className="muted num" dir="ltr">{amount || "0"} {t("points")} ≈ {fmtUsd(Math.floor(Number(amount) || 0))}</div>
        <div className="field"><label>{t("payoutMethod")}</label><div className="seg wide">{methods.map((m) => <button type="button" key={m} className={method === m ? "is-active" : ""} onClick={() => { setMethod(m); setErr(""); sfx.tick(); }}>{m === "gram" ? cfg.gram_label || t("methodGram") : t("methodBinance")}</button>)}</div></div>
        <div className="field"><label>{t("amountPts")}</label><input className="input num" dir="ltr" type="number" min={cfg.min_withdrawal_pts} max={cfg.max_withdrawal_pts} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="field"><label>{method === "gram" ? t("gramAddr") : t("binanceId")}</label><input className="input" dir="ltr" value={target} placeholder={method === "gram" ? t("gramAddrPh") : t("binanceIdPh")} inputMode={method === "binance" ? "numeric" : "text"} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setTarget(e.target.value)} /></div>
        {err && <p className="err">{err}</p>}
        <button type="button" className="btn btn-acc" onClick={submit} disabled={busy || !Number.isInteger(Number(amount)) || Number(amount) < cfg.min_withdrawal_pts || Number(amount) > cfg.max_withdrawal_pts || Number(amount) > pts || !target.trim()}>{busy ? t("submitting") : t("submit")}</button>
      </div>}
    </Sheet>
  </div>;
}
