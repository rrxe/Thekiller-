import { useMemo, useState } from "react";
import { actions, useStore } from "../lib/store";
import { ApiError, getApi, isDemo } from "../lib/api";
import { fmtPts, fmtUsd } from "../lib/format";
import { errKey, useTx, useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { toast } from "../lib/toast";
import { watchInt } from "../lib/watchAd";
import { showAdFail } from "../lib/adNotice";
import { Coin, CountUp, Icon, Sheet } from "../components/ui";

type Method = "gram" | "binance";
type Cur = "pts" | "usdt";
export default function Wallet({ onExchange }: { onExchange: () => void }) {
  const t = useT(); const tx = useTx(); const s = useStore(); const cfg = s.settings!; const pts = s.cp / 100;
  const methods = ([cfg.gram_enabled && "gram", cfg.binance_enabled && "binance"].filter(Boolean) as Method[]);
  const [cur, setCur] = useState<Cur>("pts");
  const [open, setOpen] = useState(false); const [method, setMethod] = useState<Method>(methods[0] ?? "gram");
  const ppu = Math.max(1, cfg.points_per_usd); const minUsdt = cfg.min_withdrawal_pts / ppu; const maxUsdt = cfg.max_withdrawal_pts / ppu;
  const [amount, setAmount] = useState(String(Number(minUsdt.toFixed(4)))); const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false); const [filter, setFilter] = useState<"all" | "withdrawal" | "exchange" | "game">("all");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(false);
  const adsLeft = Math.max(0, cfg.withdrawal_ads_required - s.wdAds); const pending = s.withdrawals.some((w) => w.status === "pending");
  const canOpen = s.usdtBalance >= minUsdt && adsLeft === 0 && !pending && methods.length > 0;
  const [adBusy, setAdBusy] = useState(false);
  const minSec = cfg.adsgram_int_min_seconds ?? 5; const capFull = false;
  const watchAd = async () => {
    if (adBusy || capFull) return; setAdBusy(true); sfx.click();
    try {
      const r = await watchInt("withdrawal", minSec);
      if (r.state === "noclick" || r.state === "short") showAdFail(r.state, watchAd);
      else if (r.state === "done") { haptic.win(); sfx.coin(); toast(`+${((r.rewardCp ?? 0) / 100).toFixed(2)} ${t("points")}`); }
    } catch (e) { toast(t(errKey(e instanceof ApiError ? e.code : "generic"))); }
    finally { setAdBusy(false); }
  };
  const submit = async () => {
    const value = Math.floor(parseFloat(amount) * 10000) / 10000; setErr("");
    if (!Number.isFinite(value) || value <= 0) return setErr(t("err_bad_amount"));
    setBusy(true);
    try { const result = await getApi().withdraw(value, method, target.trim()); actions.applyWithdrawal(result.withdrawal, result.usdt_balance); setOk(true); haptic.win(); sfx.win(); }
    catch (e) { const code = e instanceof ApiError ? e.code : "generic"; setErr(t(errKey(code)) + (e instanceof ApiError && e.detail && /^[\d.]+$/.test(e.detail) && ["withdraw_min", "withdraw_max", "need_ads"].includes(code) ? ` (${e.detail})` : "")); }
    finally { setBusy(false); }
  };
  const close = () => { setOpen(false); setOk(false); setErr(""); setTarget(""); };
  const unlockPct = Math.min(100, (s.usdtBalance / Math.max(0.0001, minUsdt)) * 100);
  const activity = useMemo(() => [
    ...s.withdrawals.map((w) => ({ id: `w-${w.id}`, kind: "withdrawal" as const, ts: Date.parse(w.created_at) || 0, title: t("withdraw"), detail: `${w.method === "gram" ? t("methodGram") : t("methodBinance")} · ${w.target}`, amount: w.is_usdt ? `−${Number(w.usd).toFixed(4)} USDT` : `−${fmtPts(w.amount_cp)}`, tone: w.status === "paid" ? "win" : w.status === "rejected" ? "loss" : "", status: t(`status_${w.status}` as any) })),
    ...s.exchanges.map((x) => ({ id: `x-${x.id}`, kind: "exchange" as const, ts: Date.parse(x.created_at) || 0, title: t("exchange"), detail: `+${x.usdt.toFixed(4)} USDT`, amount: `−${fmtPts(x.points * 100)}`, tone: "", status: t("exchangeSuccess") })),
    ...s.history.map((h) => { const net = h.payoutCp - h.betCp; return { id: `g-${h.id}`, kind: "game" as const, ts: h.ts, title: t(h.game as any), detail: `${fmtPts(h.betCp)} · ${h.mult.toFixed(2)}×`, amount: `${net > 0 ? "+" : net < 0 ? "−" : ""}${fmtPts(Math.abs(net))}`, tone: net > 0 ? "win" : net < 0 ? "loss" : "", status: "" }; }),
  ].sort((a, b) => b.ts - a.ts).slice(0, 30), [s.withdrawals, s.exchanges, s.history, t]);
  const visible = filter === "all" ? activity : activity.filter((a) => a.kind === filter);
  const tabs = [["all", tx("الكل", "All", "Все", "सभी")], ["withdrawal", t("withdraw")], ["exchange", t("exchange")], ["game", t("games")]] as const;

  const kindIcon = { withdrawal: "arrow-up-right", exchange: "repeat", game: "gamepad" } as const;
  const adsReq = cfg.withdrawal_ads_required;
  const adsPct = adsReq > 0 ? Math.min(100, (s.wdAds / adsReq) * 100) : 100;
  return <div className="page">
    <header className="pg-head">
      <span className="kicker">{t("wkKicker")}</span>
      <h1 className="pg-title">{t("wallet")}</h1>
      <p className="pg-intro">{t("walletIntro")}</p>
    </header>

    <section className="bal-card">
      <div className="row-between">
        <span className="label">{t("balance")}</span>
        <div className="seg" role="tablist" dir="ltr">
          {(["pts", "usdt"] as Cur[]).map((c) => <button type="button" key={c} role="tab" aria-selected={cur === c} className={cur === c ? "is-active" : ""} onClick={() => { sfx.tick(); setCur(c); }}>{c === "pts" ? "PTS" : "USDT"}</button>)}
        </div>
      </div>
      <div className="balance-main bal-big num" dir="ltr">
        {cur === "pts" ? <><CountUp value={pts} decimals={2} /><small>{t("points")}</small></> : <><CountUp value={s.usdtBalance} decimals={4} /><small>USDT</small></>}
      </div>
      <div className="balance-sub num" dir="ltr">{cur === "pts" ? `≈ ${fmtUsd(pts)}` : `${pts.toFixed(2)} ${t("points")}`}</div>
      <div className="bal-chips" dir="ltr">
        <span className="mini-chip"><Coin size={18} /><small>{t("pointsBal")}</small><b className="num">{pts.toFixed(2)}</b></span>
        <span className="mini-chip is-usdt"><span className="usdt-ico" aria-hidden="true">$</span><small>USDT</small><b className="num">{s.usdtBalance.toFixed(4)}</b></span>
      </div>
      <div className="bal-actions">
        <button type="button" className="btn btn-acc btn-lg" disabled={!canOpen} onClick={() => { sfx.click(); setOpen(true); }}><Icon name="arrow-up-right" size={18} />{t("withdraw")}</button>
        <button type="button" className="btn btn-ghost btn-lg" onClick={() => { sfx.click(); onExchange(); }}><Icon name="repeat" size={18} />{t("exchangeNow")}</button>
      </div>
    </section>

    <section className="unlock-card">
      <div className="row-between"><strong>{t("unlockProgress")}</strong><span className={`status-pill ${canOpen ? "is-ok" : pending ? "is-wait" : ""}`}>{pending ? t("status_pending") : `${Math.floor(unlockPct)}%`}</span></div>
      <div className="prog"><div className="row-between"><small className="muted">{t("usdtBalLbl")}</small><small className="num" dir="ltr">{s.usdtBalance.toFixed(4)} / {minUsdt.toFixed(4)}</small></div><div className="bar"><i style={{ width: `${unlockPct}%` }} /></div></div>
      {adsReq > 0 && <div className="prog"><div className="row-between"><small className="muted">{t("adsProgress")}</small><small className="num" dir="ltr">{s.wdAds} / {adsReq}</small></div><div className="bar"><i style={{ width: `${adsPct}%` }} /></div></div>}
      {adsReq > 0 && adsLeft > 0 && <button type="button" className="btn btn-acc mt-12" disabled={adBusy || capFull} onClick={watchAd}>{adBusy ? t("adLoading") : capFull ? t("adCapReached") : `${t("withdrawWatchAd")} (${s.wdAds}/${adsReq})`}</button>}
      {adsReq > 0 && adsLeft > 0 && <p className="ad-hint">{t("adClickHint")}</p>}
      <p className="hint">{pending ? t("err_pending_exists") : adsLeft > 0 ? `${t("adsNeeded")} (${adsLeft})` : s.usdtBalance < minUsdt ? t("withdrawNeedUsdt") : t("pendingNote")}</p>
    </section>

    <h2 className="sec">{t("payoutRules")}</h2>
    <div className="rules">
      <div className="rule"><small className="label">{t("exchangeRate")}</small><b className="num" dir="ltr">{Number(cfg.points_per_usd || 5000).toLocaleString()} = 1 USDT</b></div>
      <div className="rule"><small className="label">{t("minWithdrawLbl")}</small><b className="num" dir="ltr">{minUsdt.toFixed(4)} USDT</b></div>
      <div className="rule"><small className="label">{t("maxWithdrawLbl")}</small><b className="num" dir="ltr">{maxUsdt.toFixed(4)} USDT</b></div>
    </div>
    {isDemo() && <p className="note">{t("demoNote")}</p>}
    {cfg.payment_note && <p className="note">{cfg.payment_note}</p>}

    <h2 className="sec">{t("walletActivity")}</h2>
    <div className="chips-row">{tabs.map(([k, label]) => <button type="button" key={k} className={`chip ${filter === k ? "is-active" : ""}`} aria-pressed={filter === k} onClick={() => { sfx.tick(); setFilter(k); }}>{label}</button>)}</div>
    {!activity.length ? <p className="empty">{t("noWalletActivity")}</p> : visible.length === 0 ? <p className="empty">{tx("ماكو نشاط بهذا التصنيف", "No activity in this category", "В этой категории нет операций", "इस श्रेणी में कोई गतिविधि नहीं")}</p> : <div className="tx-list">
      {visible.map((a) => <div className="tx-row" key={a.id}>
        <span className={`tx-ico is-${a.kind}`}><Icon name={kindIcon[a.kind]} size={18} /></span>
        <span className="grow"><strong>{a.title}</strong><small className="muted block ellipsis">{a.detail}</small><small className="dim block num">{new Date(a.ts).toLocaleString()}</small></span>
        <span className="tx-end"><b className={`num ${a.tone}`} dir="ltr">{a.amount}</b>{a.status && <small className={`tx-badge ${a.tone}`}>{a.status}</small>}</span>
      </div>)}
    </div>}

    <Sheet open={open} onClose={() => !busy && close()}>
      {ok ? <div className="sheet-center"><h3 className="h3">{t("requestSent")}</h3><p className="muted">{t("pendingNote")}</p><button type="button" className="btn btn-acc" onClick={close}>{t("ok")}</button></div> : <div className="form">
        <h3 className="h3">{t("withdraw")}</h3>
        <div className="muted num" dir="ltr">{amount || "0"} USDT · {t("usdtBalLbl")}: {s.usdtBalance.toFixed(4)}</div>
        <div className="field"><label>{t("payoutMethod")}</label><div className="seg wide">{methods.map((m) => <button type="button" key={m} className={method === m ? "is-active" : ""} onClick={() => { setMethod(m); setErr(""); sfx.tick(); }}>{m === "gram" ? cfg.gram_label || t("methodGram") : t("methodBinance")}</button>)}</div></div>
        <div className="field"><label>{t("amountUsdt")}</label><input className="input num" dir="ltr" type="number" min={minUsdt} max={maxUsdt} step={0.0001} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="field"><label>{method === "gram" ? t("gramAddr") : t("binanceId")}</label><input className="input" dir="ltr" value={target} placeholder={method === "gram" ? t("gramAddrPh") : t("binanceIdPh")} inputMode={method === "binance" ? "numeric" : "text"} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setTarget(e.target.value)} /></div>
        {err && <p className="err">{err}</p>}
        <button type="button" className="btn btn-acc" onClick={submit} disabled={busy || !(Number(amount) > 0) || Number(amount) < minUsdt - 1e-9 || Number(amount) > maxUsdt + 1e-9 || Number(amount) > s.usdtBalance || !target.trim()}>{busy ? t("submitting") : t("submit")}</button>
      </div>}
    </Sheet>
  </div>;
}
