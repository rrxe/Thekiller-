import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../lib/store";
import { getApi, ApiError } from "../lib/api";
import { diceMult, DICE_MAX_CHANCE, DICE_MIN_CHANCE, type DiceMode } from "../lib/engine";
import { fmtMult, fmtPts } from "../lib/format";
import { errKey, useLang, useT } from "../lib/i18n";
import { loseFx, tweenNumber, winFx } from "../lib/fx";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { toast } from "../lib/toast";
import { motion, useAnimationControls } from "framer-motion";
import { BetControls, GameHeader, ResultLine } from "../components/ui";

const QUICK_CHANCES = [10, 25, 50, 75, 90];
// rotation that brings each face to the front, and pip layout (3x3 grid cells)
const FACE_ROT: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const FACE_T = ["rotateY(0deg)", "rotateY(90deg)", "rotateX(90deg)", "rotateX(-90deg)", "rotateY(-90deg)", "rotateY(180deg)"];
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const Face = ({ n }: { n: number }) => (
  <div className="dice-face" style={{ transform: `${FACE_T[n - 1]} translateZ(var(--dh))` }}>
    {Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[n].includes(i) ? "pip" : ""} />)}
  </div>
);

export default function Dice({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const cfg = s.settings!;
  const [stake, setStake] = useState(Math.max(cfg.min_bet_pts, 10));
  const [chance, setChance] = useState(50);
  const [mode, setMode] = useState<DiceMode>("under");
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ kind: "win" | "lose"; amount: number } | null>(null);
  const setMsg = (m: string) => { if (m) toast(m); };
  const numEl = useRef<HTMLDivElement>(null);
  const markEl = useRef<HTMLDivElement>(null);
  const tw = useRef<{ kill: () => void } | null>(null);
  const timer = useRef<number | null>(null);
  const rollingRef = useRef(false);
  const alive = useRef(true);
  const cube = useAnimationControls();
  const rot = useRef({ x: -20, y: 25 });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      rollingRef.current = false;
      tw.current?.kill();
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const mult = diceMult(chance);
  const stakeCp = Math.round(stake * 100);
  const threshold = mode === "under" ? chance : 100 - chance;
  const payout = Math.floor(stakeCp * mult + 1e-9);
  const targetLeft = mode === "under" ? 0 : threshold;

  const roll = async () => {
    if (rollingRef.current) return;
    if (stake < cfg.min_bet_pts) return setMsg(t("err_min_bet"));
    if (stake > cfg.max_bet_pts) return setMsg(t("err_max_bet"));
    if (stakeCp > s.cp) return setMsg(t("err_insufficient"));

    rollingRef.current = true;
    setMsg(""); setRolling(true); setResult(null); setWon(null);
    haptic.tap("medium"); sfx.roll();
    // tumble while the server decides
    cube.start({ rotateX: [rot.current.x, rot.current.x + 360], rotateY: [rot.current.y, rot.current.y + 360], y: 0, transition: { duration: 0.7, repeat: Infinity, ease: "linear" } });
    try {
      // The result and balance come from the server. The animation only reveals that result.
      const r = await getApi().game("dice", "roll", { stakeCp, mode, chance });
      actions.setBalance(r.balanceCp);
      actions.setNextCommit(r.nextCommit);
      actions.reveal("dice", r);
      actions.pushHistory("dice", stakeCp, r.payoutCp, r.mult);

      if (!alive.current) { rollingRef.current = false; return; }
      // land on a face derived from the real roll, with a bounce
      const face = Math.min(6, Math.floor(r.roll / (100 / 6)) + 1);
      const [fx, fy] = FACE_ROT[face];
      rot.current = { x: fx + 720, y: fy + 720 };
      cube.start({ rotateX: fx + 720, rotateY: fy + 720, y: [0, -46, 0, -16, 0, -5, 0],
        transition: { default: { duration: 1, ease: "easeOut" }, y: { duration: 1, times: [0, 0.3, 0.55, 0.72, 0.86, 0.94, 1], ease: "easeOut" } } });
      tw.current?.kill();
      const start = shown ?? 50;
      tw.current = tweenNumber(start, r.roll, 1.02, (v) => {
        if (numEl.current) numEl.current.textContent = v.toFixed(2);
        if (markEl.current) markEl.current.style.left = `${v}%`;
      }, "power3.out");

      timer.current = window.setTimeout(() => {
        timer.current = null;
        rollingRef.current = false;
        setShown(r.roll); setWon(r.win); setRolling(false);
        if (r.win) {
          setResult({ kind: "win", amount: (r.payoutCp - stakeCp) / 100 });
          sfx.win(); winFx(r.mult >= 5);
        } else {
          setResult({ kind: "lose", amount: stakeCp / 100 });
          sfx.lose(); loseFx();
        }
      }, 1060);
    } catch (e) {
      rollingRef.current = false;
      if (alive.current) {
        cube.stop(); setRolling(false);
        setMsg(t(errKey(e instanceof ApiError ? e.code : "generic")));
      }
    }
  };

  void lang;
  return (
    <div className="game-screen">
      <GameHeader game="dice" title={t("dice")} rtp="90%" onBack={onBack} />

      <div className="game-area dice-stage">
        <div className="dice-cube-wrap" aria-hidden="true">
          <motion.div className="dice-cube" animate={cube} initial={{ rotateX: -20, rotateY: 25 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => <Face key={n} n={n} />)}
          </motion.div>
        </div>
        <div className="dice-status">{rolling ? t("rollingNow") : won === true ? t("youWon") : won === false ? t("youLost") : t("readyToLaunch")}</div>
        <div ref={numEl} dir="ltr" aria-live="polite" className={`dice-number num ${won === true ? "win" : won === false ? "loss" : ""}`}>
          {shown === null ? "—.——" : shown.toFixed(2)}
        </div>
        <div className="dice-range" dir="ltr">
          <div className="dice-track"><span className="dice-zone" style={{ left: `${targetLeft}%`, width: `${chance}%` }} /><div ref={markEl} className="dice-marker" style={{ left: shown === null ? "50%" : `${shown}%`, display: shown === null && !rolling ? "none" : "block" }} /></div>
          <div className="dice-labels num"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div>
        <div className="dice-target num" dir="ltr">{mode === "under" ? t("diceTargetUnder") : t("diceTargetOver")} <b>{threshold.toFixed(2)}</b></div>
        {result && <div className="game-result"><ResultLine kind={result.kind} amount={result.amount} label={result.kind === "win" ? t("youWon") : t("youLost")} /></div>}
      </div>

      <div className="dock">
        <div className="stats3 num" dir="ltr">
          <div><small>{t("multiplier")}</small><b className="acc">{fmtMult(mult)}</b></div>
          <div><small>{t("payout")}</small><b>{fmtPts(payout)}</b></div>
          <div><small>{t("winChance")}</small><b>{chance}%</b></div>
        </div>
        <div className="seg wide">
          {(["under", "over"] as DiceMode[]).map((m) => {
            const line = m === "under" ? chance : 100 - chance;
            return <button type="button" key={m} disabled={rolling} className={mode === m ? "is-active" : ""} onClick={() => { haptic.tick(); sfx.tick(); setMode(m); }}><span>{m === "under" ? t("rollUnder") : t("rollOver")}</span><b className="num" dir="ltr">{line.toFixed(2)}</b></button>;
          })}
        </div>
        <div className="slider-row" dir="ltr">
          <input type="range" min={DICE_MIN_CHANCE} max={DICE_MAX_CHANCE} step={1} value={chance} disabled={rolling} onChange={(e) => setChance(+e.target.value)} className="range" aria-label={t("winChance")} />
        </div>
        <div className="bet-chips" dir="ltr">{QUICK_CHANCES.map((v) => <button type="button" key={v} disabled={rolling} className={`chip ${chance === v ? "is-active" : ""}`} onClick={() => { haptic.tick(); sfx.tick(); setChance(v); }}>{v}%</button>)}</div>
        <BetControls stake={stake} setStake={setStake} balancePts={s.cp / 100} disabled={rolling} />
        <button type="button" className="btn btn-acc btn-lg" disabled={rolling} onClick={roll}>{rolling ? t("rollingNow") : <>{t("roll")}<span className="num" dir="ltr">{stake} {t("points")}</span></>}</button>
      </div>
    </div>
  );
}
