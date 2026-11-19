/**
 * CrashGame.tsx — ODDXS Crash screen (view only).
 * All timing/state lives in the global loop (src/lib/crashLoop.tsx); this screen just paints it and sends
 * bets / cash-outs. Leaving and re-entering the screen never interrupts or restarts a round.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DEFAULT_SETTINGS, useStore } from "../lib/store";
import { ApiError } from "../lib/api";
import { CRASH_RTP } from "../lib/engine";
import { fmtMult, fmtPts } from "../lib/format";
import { errKey, useT } from "../lib/i18n";
import { loseFx, winFx } from "../lib/fx";
import { haptic } from "../lib/telegram";
import { sfx, engine } from "../lib/sfx";
import { toast } from "../lib/toast";
import { CrashDot } from "../lib/crashDot";
import { BETS_CLOSE_MS, WAIT_MS, useCrashLoop, useCrashLoopState } from "../lib/crashLoop";
import { BetControls, GameHeader, Switch } from "../components/ui";
import { Flash, Shake } from "../components/fx3d";

type Tone = "t1" | "t2" | "t3" | "lose";
const TONES: Record<Tone, { color: string; glow: string }> = {
  t1: { color: "#ffffff", glow: "rgba(34,224,255,.65)" },
  t2: { color: "#eaf4ff", glow: "rgba(90,150,255,.78)" },
  t3: { color: "#fff0fb", glow: "rgba(255,79,216,.85)" },
  lose: { color: "#ff5468", glow: "rgba(255,64,84,.7)" },
};
const MILESTONES = [2, 3, 5, 10, 20, 50, 100];

const BTN: CSSProperties = {
  width: "100%", height: 56, border: 0, borderRadius: 14, padding: "0 18px", display: "flex", alignItems: "center",
  justifyContent: "center", gap: 10, fontSize: 16, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase",
  position: "relative", overflow: "hidden", color: "#fff", cursor: "pointer",
};
const BTN_BET: CSSProperties = { background: "linear-gradient(180deg,#3bb4f2 0%,#1c8fcb 100%)", boxShadow: "0 10px 24px -10px rgba(34,158,217,.9), inset 0 1px 0 rgba(255,255,255,.3)" };
const BTN_OFF: CSSProperties = { background: "rgba(101,101,103,.35)", color: "#c9cde0", cursor: "default" };
const BTN_CASH: CSSProperties = { background: "linear-gradient(180deg,#36db7e 0%,#25b864 100%)", color: "#052612", justifyContent: "space-between", boxShadow: "0 0 18px rgba(46,204,113,.4)" };
const BTN_WON: CSSProperties = { background: "rgba(46,204,113,.08)", boxShadow: "inset 0 0 0 1px rgba(46,204,113,.4)", color: "#3ee58a", cursor: "default" };
const BTN_LOST: CSSProperties = { background: "linear-gradient(180deg,#ff4d5e 0%,#d62839 100%)", boxShadow: "0 0 26px rgba(255,64,84,.6), inset 0 1px 0 rgba(255,255,255,.28)", cursor: "default" };

export default function CrashGame({ onBack }: { onBack: () => void }) {
  const t = useT();
  const store = useStore();
  const settings = store.settings ?? DEFAULT_SETTINGS;
  const reduced = useReducedMotion();
  const loop = useCrashLoop();
  const snap = useCrashLoopState();
  const { phase, bet } = snap;

  const [stake, setStake] = useState(Math.max(settings.min_bet_pts, 10));
  const [autoOn, setAutoOn] = useState(false);
  const [autoText, setAutoText] = useState("2.00");
  const [closed, setClosed] = useState(false);       // betting window closed (last second before lift-off)
  const [shakeN, setShakeN] = useState(0);
  const [flashN, setFlashN] = useState(0);
  const [successN, setSuccessN] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const btnMultRef = useRef<HTMLElement>(null);
  const btnPayRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<CrashDot | null>(null);
  const live = useRef({ tone: "" as string, lastCount: 99, milestone: 0, closed: false, bet });
  live.current.bet = bet;

  const result = bet?.result ?? null;
  const cashed = result?.status === "cashed" ? result : null;
  const lostRound = result?.status === "crashed";

  const notify = useCallback((m: string) => { if (m) toast(m); }, []);
  const failMsg = useCallback((e: unknown) => notify(t(errKey(e instanceof ApiError ? e.code : "generic"))), [notify, t]);

  const paintMult = useCallback((value: number, lose = false) => {
    const el = multRef.current; if (!el) return;
    el.textContent = fmtMult(value);
    const tone: Tone = lose ? "lose" : value >= 10 ? "t3" : value >= 2 ? "t2" : "t1";
    if (live.current.tone !== tone) {
      live.current.tone = tone;
      el.style.color = TONES[tone].color;
      el.style.textShadow = `0 0 18px ${TONES[tone].glow}, 0 0 44px ${TONES[tone].glow}`;
    }
  }, []);

  /* ── ONE rAF loop per mounted screen: reads the global loop, paints canvas + DOM (no per-frame React renders) ── */
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const scene = new CrashDot(canvas);
    sceneRef.current = scene;
    let raf = 0, last = 0, alive = true;
    const frame = (ts: number) => {
      if (!alive) return;
      const dt = last ? (ts - last) / 1000 : 1 / 60; last = ts;
      const tm = loop.timing();
      const st = live.current;
      if (tm.phase === "WAITING") {
        scene.mode = "waiting"; scene.t = 0; scene.mult = 1;
        const left = tm.waitLeftMs;
        if (countRef.current) countRef.current.textContent = `${(left / 1000).toFixed(1)}s`;
        if (barRef.current) barRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, left / WAIT_MS))})`;
        const sec = Math.ceil(left / 1000);
        if (sec !== st.lastCount) { st.lastCount = sec; if (sec <= 3 && sec > 0) { sfx.countdown(sec); haptic.tick(); } }
        const isClosed = left <= BETS_CLOSE_MS;
        if (isClosed !== st.closed) { st.closed = isClosed; setClosed(isClosed); }
      } else if (tm.phase === "RUNNING") {
        scene.mode = "running"; scene.t = Math.max(0, tm.elapsed); scene.mult = tm.mult;
        paintMult(tm.mult);
        engine.set(tm.mult);
        if (btnMultRef.current) btnMultRef.current.textContent = `${tm.mult.toFixed(2)}×`;
        const b = st.bet;
        if (btnPayRef.current && b?.stakeCp) btnPayRef.current.textContent = `+${fmtPts(Math.floor(b.stakeCp * tm.mult + 1e-9))}`;
        const ms = MILESTONES[st.milestone];
        if (ms && tm.mult >= ms) { st.milestone += 1; sfx.milestone(st.milestone); haptic.tick(); }
      } else {
        const cp = tm.crashPoint ?? tm.mult;
        scene.mode = "crashed"; scene.crashMult = cp; scene.t = cp <= 1 ? 0 : Math.log(cp) / 0.12; scene.mult = cp;
        paintMult(cp, st.bet?.result?.status !== "cashed");
      }
      scene.draw(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); engine.stop(); scene.destroy(); sceneRef.current = null; };
  }, [loop, paintMult]);

  /* ── phase transitions (sound, shake, reset) ── */
  useEffect(() => {
    const scene = sceneRef.current;
    live.current.tone = "";
    if (phase === "WAITING") {
      scene?.reset(); live.current.milestone = 0; live.current.lastCount = 99; live.current.closed = false; setClosed(false);
      engine.stop(); paintMult(1);
    } else if (phase === "RUNNING") {
      live.current.milestone = 0; sfx.countdown(0); sfx.launch(); engine.start();
    } else {
      engine.stop(); sfx.explode();
      const b = live.current.bet;
      const lost = !!b && (!b.result || b.result.status === "crashed");
      if (lost) { setShakeN((n) => n + 1); setFlashN((n) => n + 1); sfx.lose(); loseFx(); } else if (b) haptic.tap("heavy");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, snap.roundNo]);

  /* ── settlement effects (win fx, cash marker) — skip a result that was already settled before this screen mounted ── */
  const handled = useRef<string | null>(bet?.result ? bet.id : null);
  useEffect(() => {
    if (!bet?.result || handled.current === bet.id) return;
    handled.current = bet.id;
    if (bet.result.status === "cashed") {
      sceneRef.current?.markCashout(bet.result.mult);
      setSuccessN((n) => n + 1); winFx(bet.result.mult >= 3); sfx.cash();
    }
  }, [bet]);
  useEffect(() => { if (phase === "WAITING") sceneRef.current?.markCashout(null); }, [phase]);

  useEffect(() => { if (snap.error) { notify(t(errKey(snap.error))); loop.clearError(); } }, [snap.error, loop, notify, t]);

  /* ── actions ── */
  const place = async () => {
    const stakeCp = Math.round(stake * 100);
    if (stake < settings.min_bet_pts) return notify(t("err_min_bet"));
    if (stake > settings.max_bet_pts) return notify(t("err_max_bet"));
    if (stakeCp > store.cp) return notify(t("err_insufficient"));
    if (!loop.canBet()) return notify(t("err_not_started"));
    const cand = autoOn ? Number.parseFloat(autoText.replace(",", ".")) : Number.NaN;
    const auto = Number.isFinite(cand) && cand >= 1.01 ? cand : null;
    sfx.click(); haptic.tap("medium");
    const err = await loop.placeBet(stakeCp, auto);
    if (err) failMsg(err);
  };
  const cash = () => { haptic.tap("heavy"); sfx.click(); void loop.cashOut(); };

  /* ── derived UI ── */
  const waiting = phase === "WAITING", running = phase === "RUNNING", crashedPhase = phase === "CRASHED";
  const controlsLocked = !waiting || !!bet || snap.placing;
  const statusText = waiting ? t("readyToLaunch") : running ? (cashed ? t("cashed") : t("running")) : (cashed ? t("cashed") : t("crashed"));
  const statusColor = cashed ? "#2ecc71" : crashedPhase ? "#ff5468" : running ? "#bff4ff" : "#9aa0b8";
  const autoTarget = bet?.auto ?? null;
  const crashAt = result?.crashPoint ?? null;

  let button: ReactNode;
  if (running && bet && !result && !bet.cashing) {
    button = (
      <motion.button key="cash" type="button" onClick={cash}
        initial={reduced ? false : { opacity: 0, scale: 0.94 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: [1, 1.02, 1], boxShadow: ["0 0 14px rgba(46,204,113,.3)", "0 0 36px rgba(46,204,113,.8)", "0 0 14px rgba(46,204,113,.3)"] }}
        exit={{ opacity: 0 }}
        transition={{ opacity: { duration: 0.1 }, scale: { duration: 0.9, repeat: Infinity }, boxShadow: { duration: 0.9, repeat: Infinity } }}
        whileTap={reduced ? undefined : { scale: 0.96 }} style={{ ...BTN, ...BTN_CASH }}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.05 }}>
          <em style={{ fontStyle: "normal" }}>{t("cashOut")}</em>
          <small ref={btnPayRef} className="num" dir="ltr" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0, opacity: 0.85 }}>{" "}</small>
        </span>
        <b ref={btnMultRef} className="num" dir="ltr" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>1.00×</b>
      </motion.button>
    );
  } else if (running && bet && !result && bet.cashing) {
    // optimistic: the click is registered instantly with the multiplier the player saw
    button = <button key="cashing" type="button" disabled style={{ ...BTN, ...BTN_WON }}>{t("cashed")} · {fmtMult(bet.clickMult ?? 1)} …</button>;
  } else if (cashed) {
    button = <button key="won" type="button" disabled style={{ ...BTN, ...BTN_WON }}>{t("cashed")} · {fmtMult(cashed.mult)} · +{fmtPts(cashed.payoutCp)}</button>;
  } else if (lostRound) {
    button = <button key="lost" type="button" disabled style={{ ...BTN, ...BTN_LOST }}>{t("crashed")}{crashAt ? ` @ ${fmtMult(crashAt)}` : ""}</button>;
  } else if (waiting && bet) {
    button = <button key="placed" type="button" disabled style={{ ...BTN, ...BTN_WON }}>✓ {t("bet")} · {fmtPts(bet.stakeCp)} {t("points")}</button>;
  } else if (waiting && !closed) {
    button = (
      <motion.button key="bet" type="button" onClick={place} disabled={snap.placing} whileTap={reduced ? undefined : { scale: 0.975 }} style={{ ...BTN, ...BTN_BET, opacity: snap.placing ? 0.7 : 1 }}>
        {t("bet")}
        <span className="num" dir="ltr" style={{ paddingInlineStart: 10, borderInlineStart: "1px solid rgba(255,255,255,.3)", fontWeight: 600, letterSpacing: 0, textTransform: "none" }}>{stake} {t("points")}</span>
      </motion.button>
    );
  } else {
    button = <button key="off" type="button" disabled style={{ ...BTN, ...BTN_OFF }}>{waiting ? t("launching") : `${t("nextRound")}…`}</button>;
  }

  return (
    <div style={{ position: "relative", height: "100dvh", maxHeight: "100%", overflow: "hidden", display: "flex", flexDirection: "column", overscrollBehavior: "none" }}>
      <Flash trigger={flashN} color="rgba(255,50,70,.38)" />
      <Shake trigger={reduced ? 0 : shakeN} power={1.5} className="game-screen">
        <GameHeader game="crash" title={t("crash")} rtp={`${Math.round(CRASH_RTP * 100)}%`} onBack={onBack} />

        <div className="history-strip" dir="ltr" aria-label={t("lastCrashes")}>
          {snap.history.map((v, i) => (
            <motion.span key={`${snap.roundNo}-${i}`} layout initial={reduced ? false : { opacity: 0, scale: 0.6, x: -12 }} animate={{ opacity: 1, scale: 1, x: 0 }} className={`hchip num ${v >= 2 ? "is-win" : "is-loss"}`}>{v.toFixed(2)}x</motion.span>
          ))}
          {snap.history.length === 0 && <span className="hchip dim">{t("lastCrashes")}</span>}
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: "#050711" }}>
          <canvas ref={canvasRef} aria-label="Crash multiplier graph" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }} />

          <div dir="ltr" style={{ position: "absolute", insetInline: 0, top: "9%", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, pointerEvents: "none" }}>
            <motion.div key={phase + (cashed ? "-c" : "")} initial={reduced ? false : { opacity: 0, y: -7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 22, padding: "0 11px", borderRadius: 999, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)", color: statusColor, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
              <i aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />{statusText}
            </motion.div>

            {/* WAITING: "Next round in 6.5s" — RUNNING/CRASHED: the multiplier */}
            <div style={{ display: waiting ? "flex" : "none", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div className="num" style={{ fontSize: "clamp(20px, 4.4dvh, 30px)", fontWeight: 800, color: "#fff", textShadow: "0 0 18px rgba(34,224,255,.6)" }}>
                {t("nextRound")} <span ref={countRef} style={{ color: "#22e0ff" }}>7.0s</span>
              </div>
              <div style={{ width: 150, height: 4, borderRadius: 4, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                <div ref={barRef} style={{ height: "100%", background: "linear-gradient(90deg,#22e0ff,#3e8cff)", transformOrigin: "left center", boxShadow: "0 0 10px rgba(34,224,255,.8)" }} />
              </div>
            </div>
            <motion.div ref={multRef} className="num" initial={false}
              animate={successN > 0 && cashed && !reduced ? { scale: [1, 1.14, 1] } : { scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ display: waiting ? "none" : "block", fontSize: "clamp(48px, 10dvh, 84px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums", color: "#fff", textShadow: "0 0 18px rgba(34,224,255,.65), 0 0 44px rgba(34,224,255,.65)" }}>
              1.00×
            </motion.div>
            <div className="num" style={{ height: 20, fontSize: 13, fontWeight: 700 }}>
              {cashed && <span style={{ color: "#2ecc71" }}>{t("cashedAt")} {fmtMult(cashed.mult)} · +{fmtPts(cashed.payoutCp)}</span>}
              {!cashed && lostRound && crashedPhase && crashAt && <span style={{ color: "#ff5468" }}>{t("crashedAt")} {fmtMult(crashAt)}</span>}
            </div>
          </div>

          {autoTarget && !crashedPhase && (
            <div className="num" dir="ltr" style={{ position: "absolute", top: 8, right: 12, padding: "2px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", fontSize: 12, color: "#c9cde0" }}>AUTO {fmtMult(autoTarget)}</div>
          )}

          <AnimatePresence>
            {cashed && successN > 0 && (
              <motion.div key={`win-${successN}`} initial={{ opacity: 0, scale: 0.72, y: 12 }} animate={{ opacity: [0, 1, 0], scale: [0.72, 1.08, 1.18], y: [12, -4, -18] }} exit={{ opacity: 0 }}
                transition={{ duration: 1.1, times: [0, 0.22, 1], ease: "easeOut" }} aria-live="polite"
                style={{ position: "absolute", left: "50%", top: "46%", x: "-50%", padding: "8px 16px", borderRadius: 999, background: "rgba(46,204,113,.16)", border: "1px solid rgba(46,204,113,.55)", boxShadow: "0 0 30px rgba(46,204,113,.45)", color: "#5be595", fontWeight: 800, pointerEvents: "none", whiteSpace: "nowrap" }}>
                ✓ {t("cashedAt")} {fmtMult(cashed.mult)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="dock">
          <BetControls stake={stake} setStake={setStake} balancePts={store.cp / 100} disabled={controlsLocked} />
          <div className="cash-row" dir="ltr">
            <Switch on={autoOn} onChange={setAutoOn} label={t("cashoutAt")} disabled={controlsLocked} />
            <label className="bet-input">
              <input className="input num" inputMode="decimal" aria-label={t("autoCash")} value={autoText} placeholder={t("autoPh")} disabled={!autoOn || controlsLocked} onChange={(e) => setAutoText(e.target.value)} />
              <span>×</span>
            </label>
          </div>
          <div style={{ height: 56 }}>
            <AnimatePresence mode="wait" initial={false}>{button}</AnimatePresence>
          </div>
        </div>
      </Shake>
    </div>
  );
}
