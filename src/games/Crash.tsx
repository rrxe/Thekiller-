import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { actions, DEFAULT_SETTINGS, useStore } from "../lib/store";
import { getApi, ApiError } from "../lib/api";
import { crashMultAt } from "../lib/engine";
import { fmtMult, fmtPts } from "../lib/format";
import { errKey, useT } from "../lib/i18n";
import { loseFx, winFx } from "../lib/fx";
import { haptic } from "../lib/telegram";
import { sfx, engine } from "../lib/sfx";
import { toast } from "../lib/toast";
import { CrashScene } from "../lib/crashScene";
import { BetControls, GameHeader, Switch } from "../components/ui";
import { Flash, Shake } from "../components/fx3d";

type Phase = "idle" | "countdown" | "flying" | "over";
type SettledStatus = "cashed" | "crashed";
interface Round {
  id: string;
  launchAt: number;
  offset: number;
  auto: number | null;
  stakeCp: number;
}
interface Settled {
  status: SettledStatus;
  mult: number;
  payoutCp: number;
  crashPoint: number;
}
interface CrashResponse extends Settled {
  id: string;
  balanceCp: number;
  serverSeed?: string;
  commit?: string;
  clientSeed?: string;
  nonce?: number;
}
interface Runtime {
  phase: Phase;
  round: Round | null;
  result: Settled | null;
  cashing: boolean;
  polling: boolean;
  milestone: number;
  lastCount: number;
  lastLive: number;
  exploded: boolean;
  lost: boolean;
  raf: number;
  alive: boolean;
}

// Keep a running server round alive when the player briefly navigates away.
let carry: Round | null = null;
const MILESTONES = [2, 3, 5, 10, 20, 50, 100];
const EMPTY_RUNTIME = (): Runtime => ({
  phase: "idle", round: null, result: null, cashing: false, polling: false,
  milestone: 0, lastCount: 99, lastLive: 0, exploded: false, lost: false,
  raf: 0, alive: true,
});

export default function Crash({ onBack }: { onBack: () => void }) {
  const t = useT();
  const store = useStore();
  const settings = store.settings ?? DEFAULT_SETTINGS;
  const reducedMotion = useReducedMotion();
  const [stake, setStake] = useState(Math.max(settings.min_bet_pts, 10));
  const [autoOn, setAutoOn] = useState(false);
  const [autoText, setAutoText] = useState("2.00");
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [live, setLive] = useState(1);
  const [cashed, setCashed] = useState<{ mult: number; payoutCp: number } | null>(null);
  const [crashes, setCrashes] = useState<{ id: number; value: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [shakeN, setShakeN] = useState(0);
  const [flashN, setFlashN] = useState(0);
  const [successN, setSuccessN] = useState(0);
  const chipId = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multiplierRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CrashScene | null>(null);
  const runtime = useRef<Runtime>(EMPTY_RUNTIME());
  const pollRef = useRef<() => Promise<void>>(async () => undefined);

  const notify = useCallback((message: string) => { if (message) toast(message); }, []);
  const setPhaseSafe = useCallback((next: Phase) => {
    runtime.current.phase = next;
    setPhase(next);
  }, []);
  const setMultiplier = useCallback((value: number, failed = false) => {
    const el = multiplierRef.current;
    if (!el) return;
    const tier = value >= 10 ? 3 : value >= 2 ? 2 : 1;
    el.textContent = fmtMult(value);
    el.className = `crash-mult num ${failed ? "is-lose" : `tier-${tier}`}`;
  }, []);

  const applySettled = useCallback((response: CrashResponse) => {
    const state = runtime.current;
    if (state.result) return;
    state.result = {
      status: response.status,
      mult: response.mult,
      payoutCp: response.payoutCp,
      crashPoint: response.crashPoint,
    };
    const stakeCp = state.round?.stakeCp ?? 0;
    carry = null;
    actions.setBalance(response.balanceCp);
    actions.reveal("crash", response);
    actions.pushHistory("crash", stakeCp, response.payoutCp, response.mult);

    if (response.status === "cashed") {
      state.lost = false;
      if (sceneRef.current) sceneRef.current.cashed = true;
      setCashed({ mult: response.mult, payoutCp: response.payoutCp });
      setSuccessN((n) => n + 1);
      winFx(response.mult >= 3);
      sfx.cash();
    } else {
      state.lost = true;
    }
  }, []);

  const poll = useCallback(async () => {
    const state = runtime.current;
    if (state.polling || state.result || !state.round) return;
    state.polling = true;
    try {
      const response = await getApi().game("crash", "status", { id: state.round.id });
      if (response.status !== "running") applySettled(response as CrashResponse);
    } catch (error) {
      if (error instanceof ApiError && (error.code === "not_found" || error.code === "round_closed")) {
        carry = null;
      }
    } finally {
      state.polling = false;
    }
  }, [applySettled]);
  pollRef.current = poll;

  const cashOut = useCallback(async () => {
    const state = runtime.current;
    if (state.phase !== "flying" || state.result || state.cashing || !state.round) return;
    state.cashing = true;
    haptic.tap("heavy");
    sfx.click();
    try {
      const response = await getApi().game("crash", "cashout", { id: state.round.id });
      applySettled(response as CrashResponse);
    } catch (error) {
      notify(t(errKey(error instanceof ApiError ? error.code : "generic")));
    } finally {
      state.cashing = false;
    }
  }, [applySettled, notify, t]);

  const begin = useCallback((round: Round) => {
    const state = runtime.current;
    state.round = round;
    state.result = null;
    state.cashing = false;
    state.polling = false;
    state.milestone = 0;
    state.lastCount = 99;
    state.exploded = false;
    state.lost = false;
    carry = round;
    sceneRef.current?.reset();
    if (sceneRef.current) sceneRef.current.mode = "countdown";
    setCashed(null);
    setLive(1);
    setMultiplier(1);
    setCount(3);
    setPhaseSafe("countdown");
  }, [setMultiplier, setPhaseSafe]);

  const start = useCallback(async () => {
    if (busy) return;
    const stakeCp = Math.round(stake * 100);
    if (stake < settings.min_bet_pts) return notify(t("err_min_bet"));
    if (stake > settings.max_bet_pts) return notify(t("err_max_bet"));
    if (stakeCp > store.cp) return notify(t("err_insufficient"));
    const candidate = autoOn ? Number.parseFloat(autoText.replace(",", ".")) : Number.NaN;
    const auto = Number.isFinite(candidate) && candidate >= 1.01 ? candidate : null;

    setBusy(true);
    sfx.click();
    try {
      const response = await getApi().game("crash", "start", { stakeCp, auto });
      actions.setBalance(response.balanceCp);
      actions.setNextCommit(response.nextCommit);
      begin({
        id: response.id,
        launchAt: response.launchAt,
        offset: response.serverNow - Date.now(),
        auto: response.auto ?? null,
        stakeCp,
      });
      haptic.tap("medium");
    } catch (error) {
      notify(t(errKey(error instanceof ApiError ? error.code : "generic")));
    } finally {
      setBusy(false);
    }
  }, [autoOn, autoText, begin, busy, notify, settings.max_bet_pts, settings.min_bet_pts, stake, store.cp, t]);

  const explode = useCallback(() => {
    const state = runtime.current;
    if (state.exploded) return;
    state.exploded = true;
    if (sceneRef.current) sceneRef.current.mode = "crashed";
    engine.stop();
    const crashPoint = state.result?.crashPoint ?? 1;
    setMultiplier(crashPoint, state.lost);
    setCrashes((items) => [{ id: ++chipId.current, value: crashPoint }, ...items].slice(0, 10));
    if (state.lost) {
      setShakeN((n) => n + 1);
      setFlashN((n) => n + 1);
      sfx.explode();
      sfx.lose();
      loseFx();
    } else {
      sfx.explode();
      haptic.tap("heavy");
    }
    setPhaseSafe("over");
  }, [setMultiplier, setPhaseSafe]);

  // The animation clock is driven by requestAnimationFrame; the server owns all outcomes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = runtime.current;
    state.alive = true;
    sceneRef.current = new CrashScene(canvas);

    const resume = carry ?? (
      store.resume?.crash?.status === "running" && store.resume.crash.launchAt
        ? {
            id: store.resume.crash.id,
            launchAt: store.resume.crash.launchAt,
            offset: store.resume.crash.serverNow - Date.now(),
            auto: null,
            stakeCp: 0,
          }
        : null
    );
    if (store.resume?.crash && store.resume.crash.status !== "running") actions.clearResume("crash");
    if (resume) {
      begin(resume);
      notify(t("restored"));
    }

    const frame = () => {
      if (!state.alive) return;
      const scene = sceneRef.current;
      const round = state.round;
      if (scene && round && (state.phase === "countdown" || state.phase === "flying")) {
        const elapsed = (Date.now() + round.offset - round.launchAt) / 1000;
        if (state.phase === "countdown") {
          if (elapsed < 0) {
            const next = Math.ceil(-elapsed);
            if (next !== state.lastCount) {
              state.lastCount = next;
              setCount(next);
              sfx.countdown(next);
              haptic.tick();
            }
          } else {
            sfx.countdown(0);
            sfx.launch();
            engine.start();
            scene.mode = "flying";
            setPhaseSafe("flying");
          }
        }
        if (state.phase === "flying") {
          const raw = crashMultAt(Math.max(0, elapsed));
          const finalPoint = state.result?.crashPoint;
          scene.t = Math.max(0, elapsed);
          if (finalPoint !== undefined && raw >= finalPoint) {
            scene.mult = finalPoint;
            explode();
          } else {
            const value = Math.floor(raw * 100) / 100;
            scene.mult = value;
            setMultiplier(value);
            engine.set(value);
            const milestone = MILESTONES[state.milestone];
            if (milestone && value >= milestone) {
              state.milestone += 1;
              sfx.milestone(state.milestone);
              haptic.tick();
            }
            const now = performance.now();
            if (now - state.lastLive > 90) {
              state.lastLive = now;
              setLive(value);
            }
            if (!state.result && round.auto && value >= round.auto) void pollRef.current();
          }
        }
      }
      state.raf = requestAnimationFrame(frame);
    };

    state.raf = requestAnimationFrame(frame);
    const pollTimer = window.setInterval(() => {
      if (state.phase === "flying") void pollRef.current();
    }, 280);

    return () => {
      state.alive = false;
      cancelAnimationFrame(state.raf);
      window.clearInterval(pollTimer);
      engine.stop();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
    // One animation lifecycle per mounted game screen. Dynamic callbacks are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stakeCp = runtime.current.round?.stakeCp ?? 0;
  const potentialPayoutCp = stakeCp ? Math.floor(stakeCp * live + 1e-9) : 0;
  const idle = phase === "idle" || phase === "over";
  const result = runtime.current.result;
  const nextCommit = store.nextCommit;
  const commitLabel = nextCommit ? `${nextCommit.slice(0, 10)}…${nextCommit.slice(-8)}` : "";
  const status = phase === "countdown" ? t("launching") : phase === "flying" ? (cashed ? t("cashed") : t("running")) : phase === "over" ? (cashed ? t("cashed") : t("crashed")) : t("readyToLaunch");
  const autoTarget = runtime.current.round?.auto;

  return (
    <div className="game-screen crash-game-screen" style={{ height: "100dvh", maxHeight: "100%", overflow: "hidden" }}>
      <GameHeader game="crash" title={t("crash")} rtp="97%" onBack={onBack} />

      <div className="history-strip" dir="ltr" aria-label={t("lastCrashes")}>
        {crashes.map((item) => (
          <span key={item.id} className={`hchip num ${item.value >= 2 ? "is-win" : "is-loss"}`}>
            {item.value.toFixed(2)}x
          </span>
        ))}
        {crashes.length === 0 && <span className="hchip dim">{t("lastCrashes")}</span>}
      </div>

      <Shake trigger={reducedMotion ? 0 : shakeN} power={1.25} className="game-area crash-stage">
        <Flash trigger={flashN} color="rgba(255,62,76,.34)" />
        <canvas ref={canvasRef} aria-label="Crash multiplier graph" />
        <div className="crash-overlay" dir="ltr">
          <motion.div
            className={`crash-status st-${cashed ? "cashed" : phase}`}
            key={phase + (cashed ? "-cashed" : "")}
            initial={reducedMotion ? false : { opacity: 0, y: -7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <i aria-hidden="true" />{status}
          </motion.div>
          <motion.div
            ref={multiplierRef}
            className={`crash-mult num tier-1 ${phase === "countdown" ? "is-dim" : ""}`}
            initial={false}
            animate={successN > 0 && cashed ? { scale: [1, 1.12, 1], textShadow: ["0 0 24px rgba(46,204,113,.1)", "0 0 42px rgba(46,204,113,.9)", "0 0 28px rgba(46,204,113,.5)"] } : { scale: 1 }}
            transition={{ duration: 0.52, ease: "easeOut" }}
          >
            1.00×
          </motion.div>
          <div className="crash-sub num">
            {cashed && <span className="win">{t("cashedAt")} {fmtMult(cashed.mult)} · +{fmtPts(cashed.payoutCp)}</span>}
            {!cashed && phase === "over" && result && <span className="loss">{t("crashedAt")} {fmtMult(result.crashPoint)}</span>}
          </div>
        </div>

        {phase === "countdown" && (
          <motion.div className="crash-count num" dir="ltr" key={count} initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
            <svg viewBox="0 0 72 72" aria-hidden="true">
              <circle className="ring-bg" cx="36" cy="36" r="32" />
              <circle className="ring-fg" cx="36" cy="36" r="32" pathLength={100} />
            </svg>
            <span>{count}</span>
          </motion.div>
        )}

        {autoTarget && phase !== "over" && <div className="auto-badge num" dir="ltr">AUTO {fmtMult(autoTarget)}</div>}
        {idle && commitLabel && <div className="fair-note" dir="ltr">{t("nextCommitLbl")}: {commitLabel}</div>}

        <AnimatePresence>
          {cashed && successN > 0 && (
            <motion.div
              key={`cash-success-${successN}`}
              className="crash-success-burst"
              initial={{ opacity: 0, scale: .72, y: 12 }}
              animate={{ opacity: [0, 1, 0], scale: [0.72, 1.08, 1.18], y: [12, -4, -16] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.05, times: [0, .22, 1], ease: "easeOut" }}
              aria-live="polite"
            >
              <span>✓</span> {t("cashedAt")} {fmtMult(cashed.mult)}
            </motion.div>
          )}
        </AnimatePresence>
      </Shake>

      <div className="dock">
        <BetControls stake={stake} setStake={setStake} balancePts={store.cp / 100} disabled={busy || !idle} />
        <div className="cash-row" dir="ltr">
          <Switch on={autoOn} onChange={setAutoOn} label={t("cashoutAt")} disabled={!idle || busy} />
          <label className="bet-input">
            <input
              className="input num"
              inputMode="decimal"
              aria-label={t("autoCash")}
              value={autoText}
              placeholder={t("autoPh")}
              disabled={!autoOn || !idle || busy}
              onChange={(event) => setAutoText(event.target.value)}
            />
            <span>×</span>
          </label>
        </div>

        {phase === "flying" ? (
          cashed ? (
            <motion.button type="button" className="btn btn-ghost btn-lg" disabled initial={{ scale: .96 }} animate={{ scale: 1 }}>
              {t("cashed")} · {fmtMult(cashed.mult)}
            </motion.button>
          ) : (
            <motion.button
              type="button"
              className="btn btn-win btn-lg cashout"
              onClick={cashOut}
              disabled={busy || runtime.current.cashing}
              whileTap={reducedMotion ? undefined : { scale: .975 }}
              animate={reducedMotion ? undefined : {
                scale: [1, 1.012, 1],
                boxShadow: ["0 0 14px rgba(46,204,113,.28)", "0 0 30px rgba(46,204,113,.62)", "0 0 14px rgba(46,204,113,.28)"],
              }}
              transition={{ duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="co-l"><em>{t("cashOut")}</em><small className="num" dir="ltr">{potentialPayoutCp > 0 ? `+${fmtPts(potentialPayoutCp)}` : " "}</small></span>
              <b className="num" dir="ltr">{live.toFixed(2)}×</b>
            </motion.button>
          )
        ) : (
          <motion.button type="button" className="btn btn-acc btn-lg bet-go" disabled={busy || phase === "countdown"} onClick={start} whileTap={reducedMotion ? undefined : { scale: .985 }}>
            {phase === "countdown" ? t("launching") : <>{phase === "over" ? t("playAgain") : t("bet")}<span className="num" dir="ltr">{stake} {t("points")}</span></>}
          </motion.button>
        )}
      </div>
    </div>
  );
}
