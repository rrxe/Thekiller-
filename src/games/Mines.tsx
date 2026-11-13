import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../lib/store";
import { getApi, ApiError } from "../lib/api";
import { MINES_CELLS } from "../lib/engine";
import { fmtMult, fmtPts } from "../lib/format";
import { errKey, useLang, useT } from "../lib/i18n";
import { loseFx, winFx } from "../lib/fx";
import { haptic } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { toast } from "../lib/toast";
import { motion } from "framer-motion";
import { BetControls, GameHeader, ResultLine } from "../components/ui";
import { Bomb3D, Flash, Gem3D, Shake, Sparkle } from "../components/fx3d";

type Phase = "setup" | "playing" | "over";
const MINE_CHOICES = [
  { n: 5, en: "Easy", ar: "سهل", tone: "easy" },
  { n: 10, en: "Medium", ar: "متوسط", tone: "med" },
  { n: 15, en: "Hard", ar: "صعب", tone: "hard" },
] as const;

export default function Mines({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const cfg = s.settings!;
  const [stake, setStake] = useState(Math.max(cfg.min_bet_pts, 10));
  const [mines, setMines] = useState<number>(5);
  const [phase, setPhase] = useState<Phase>("setup");
  const [open, setOpen] = useState<number[]>([]);
  const [board, setBoard] = useState<boolean[] | null>(null);
  const [boom, setBoom] = useState<number | null>(null);
  const [mult, setMult] = useState(1);
  const [nextMult, setNextMult] = useState(1);
  const [stakeCp, setStakeCp] = useState(0);
  const [result, setResult] = useState<{ kind: "win" | "lose"; amount: number } | null>(null);
  const setMsg = (m: string) => { if (m) toast(m); };
  const [busy, setBusy] = useState(false);
  const [boomN, setBoomN] = useState(0);
  const id = useRef<string | null>(null);

  // restore an open round (app was closed mid-game)
  useEffect(() => {
    const r = s.resume?.mines;
    if (r?.id) {
      id.current = r.id; setMines(r.mines); setOpen(r.opened); setMult(r.mult); setNextMult(r.nextMult); setStakeCp(r.stakeCp); setPhase("playing"); setMsg(t("restored"));
    }
  }, []); // eslint-disable-line

  const fail = (e: unknown) => setMsg(t(errKey(e instanceof ApiError ? e.code : "generic")));

  const start = async () => {
    if (busy) return;
    const cp = Math.round(stake * 100);
    if (stake < cfg.min_bet_pts) return setMsg(t("err_min_bet"));
    if (stake > cfg.max_bet_pts) return setMsg(t("err_max_bet"));
    if (cp > s.cp) return setMsg(t("err_insufficient"));
    setBusy(true); setMsg("");
    try {
      const r = await getApi().game("mines", "start", { stakeCp: cp, mines });
      id.current = r.id; actions.setBalance(r.balanceCp); actions.setNextCommit(r.nextCommit);
      setOpen([]); setBoard(null); setBoom(null); setResult(null); setMult(1); setNextMult(r.nextMult); setStakeCp(cp); setPhase("playing");
      haptic.tap("medium"); sfx.click();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const finish = (r: any, won: boolean) => {
    actions.setBalance(r.balanceCp); actions.reveal("mines", r);
    actions.clearResume("mines");
    setBoard(r.board); setPhase("over");
    if (won) {
      actions.pushHistory("mines", stakeCp, r.payoutCp, r.mult ?? mult);
      setMult(r.mult); setResult({ kind: "win", amount: (r.payoutCp - stakeCp) / 100 }); sfx.cash(); winFx((r.mult ?? 1) >= 3);
    } else {
      actions.pushHistory("mines", stakeCp, 0, 0);
      setResult({ kind: "lose", amount: stakeCp / 100 }); sfx.bomb(); loseFx();
    }
  };

  const tap = async (i: number) => {
    if (phase !== "playing" || busy || open.includes(i)) return;
    setBusy(true); haptic.tap("light"); sfx.flip();
    try {
      const r = await getApi().game("mines", "reveal", { id: id.current, cell: i });
      if (!r.safe) { setBoom(i); setBoomN((n) => n + 1); setOpen(r.opened); finish(r, false); }
      else {
        setOpen(r.opened); setMult(r.mult); sfx.gem(Math.min(8, r.opened.length - 1));
        if (r.status === "won") finish(r, true); else setNextMult(r.nextMult);
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const cash = async () => {
    if (phase !== "playing" || busy || open.length === 0) return;
    setBusy(true);
    try { const r = await getApi().game("mines", "cashout", { id: id.current }); setOpen(r.opened); finish(r, true); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const payout = Math.floor(stakeCp * mult + 1e-9);
  return (
    <div className="game-screen">
      <GameHeader game="mines" title={t("mines")} rtp="90%" onBack={onBack} />

      <div className="stats3 stats-strip num" aria-live="polite" dir="ltr">
        <div><small>{t("multiplier")}</small><b className="acc">{fmtMult(mult)}</b></div>
        <div><small>{t("payout")}</small><b>{fmtPts(phase === "setup" ? Math.round(stake * 100) : payout)}</b></div>
        <div><small>{phase === "playing" ? t("next") : t("mineCount")}</small><b>{phase === "playing" ? fmtMult(nextMult) : String(mines)}</b></div>
      </div>

      <Shake trigger={boomN} className="game-area mines-board">
        <Flash trigger={boomN} />
        <div className="mines-fit"><div className="mines-grid" dir="ltr">
          {Array.from({ length: MINES_CELLS }, (_, i) => {
            const picked = open.includes(i);
            const bomb = board ? board[i] : false;
            const shown = picked || (phase === "over" && board !== null);
            const cls = !shown ? "tile-cell" : bomb ? (boom === i ? "tile-cell is-bomb is-hit" : "tile-cell is-bomb is-muted") : picked ? "tile-cell is-gem" : "tile-cell is-gem is-muted";
            return (
              <motion.button type="button" key={i} disabled={phase !== "playing" || picked || busy} onClick={() => tap(i)} className={cls}
                whileTap={phase === "playing" && !picked ? { scale: 0.9 } : undefined} aria-label={`Tile ${i + 1}${shown ? bomb ? ", mine" : ", gem" : ""}`}>
                {shown && (
                  <motion.span className="tile-face" initial={{ rotateY: 90, scale: 0.5 }}
                    animate={{ rotateY: 0, scale: picked && !bomb ? [0.5, 1.3, 1] : bomb && boom === i ? [0.5, 1.25, 1] : 1 }}
                    transition={{ duration: 0.38, ease: "easeOut" }}>
                    {bomb ? <Bomb3D /> : <Gem3D />}
                    {picked && !bomb && <Sparkle />}
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div></div>
        {result && <div className="game-result"><ResultLine kind={result.kind} amount={result.amount} label={result.kind === "win" ? t("youWon") : t("youLost")} /></div>}
        {!result && <div className="game-result" />}
      </Shake>

      <div className="dock">
        {phase === "playing" ? (
          <>
            <div className="kv"><span className="muted">{open.length} / {MINES_CELLS - mines} {t("gems")}</span><b className="num" dir="ltr">{fmtMult(mult)} → {fmtMult(nextMult)}</b></div>
            <button type="button" className="btn btn-win btn-lg cashout" disabled={open.length === 0 || busy} onClick={() => { haptic.tap("heavy"); sfx.click(); cash(); }}><span>{t("cashOut")}</span><b className="num" dir="ltr">+{fmtPts(payout)}</b></button>
          </>
        ) : (
          <>
            <div className="mines-pick" dir="ltr" role="radiogroup" aria-label={t("mineCount")}>
              {MINE_CHOICES.map((c) => (
                <motion.button type="button" role="radio" aria-checked={mines === c.n} key={c.n} disabled={busy}
                  className={`mines-opt is-${c.tone} ${mines === c.n ? "is-active" : ""}`} whileTap={{ scale: 0.96 }}
                  onClick={() => { haptic.tick(); sfx.tick(); setMines(c.n); }}>
                  <b className="num">{c.n} {lang === "ar" ? "ألغام" : "Mines"}</b>
                  <small>{lang === "ar" ? c.ar : c.en}</small>
                </motion.button>
              ))}
            </div>
            <BetControls stake={stake} setStake={setStake} balancePts={s.cp / 100} disabled={busy} />
            <button type="button" className="btn btn-acc btn-lg" disabled={busy} onClick={start}>{phase === "over" ? t("playAgain") : t("start")}<span className="num" dir="ltr">{stake} {t("points")}</span></button>
          </>
        )}
      </div>
    </div>
  );
}
