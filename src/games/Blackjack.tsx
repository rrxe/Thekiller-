import { useEffect, useRef, useState } from "react";
import { actions, useStore } from "../lib/store";
import { getApi, ApiError } from "../lib/api";
import { handValue, type BjOutcome, type Card } from "../lib/engine";
import { errKey, useLang, useT } from "../lib/i18n";
import { loseFx, tweenNumber, winFx } from "../lib/fx";
import { haptic } from "../lib/telegram";
import { bjSound } from "../lib/bjSound";
import { toast } from "../lib/toast";
import { AnimatePresence, motion } from "framer-motion";
import { BetControls, GameHeader } from "../components/ui";
import { Flash } from "../components/fx3d";

type Phase = "idle" | "player" | "done";
type Result = { kind: "win" | "lose" | "push"; amount: number; outcome: BjOutcome };
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUIT = ["♠", "♥", "♦", "♣"];

/** Hi-Lo: 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1 */
const hiLo = (c: Card) => (c.r >= 2 && c.r <= 6 ? 1 : c.r >= 7 && c.r <= 9 ? 0 : -1);
const countOf = (cards: Card[]) => cards.reduce((n, c) => n + hiLo(c), 0);

/** One card. Flies from the deck (top-right) while spinning flat, lands, then flips face-up.
 *  `slow` = the dealer's hole card: a long, suspenseful flip with a small lift.
 *  Each card plays its own deal / flip sound, timed to its animation. */
function PlayingCard({ c, faceDown, delay = 0, slow }: { c?: Card; faceDown?: boolean; delay?: number; slow?: boolean }) {
  const red = !!c && (c.s === 1 || c.s === 2);
  const down = faceDown || !c;
  const isFace = !!c && c.r >= 11;
  const prevDown = useRef<boolean | null>(null);

  useEffect(() => {
    const timers: number[] = [];
    if (prevDown.current === null) {
      timers.push(window.setTimeout(bjSound.deal, delay * 1000));
      if (!down) timers.push(window.setTimeout(bjSound.flip, (slow ? 0.2 + 0.4 : delay + 0.3 + 0.28) * 1000));
    } else if (prevDown.current && !down) {
      if (slow) { timers.push(window.setTimeout(bjSound.flip, 380)); }
      else timers.push(window.setTimeout(bjSound.flip, 280));
    }
    prevDown.current = down;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [down]); // eslint-disable-line

  return (
    <motion.div dir="ltr" className="pcard3d"
      initial={{ x: 170, y: -190, rotate: 38, opacity: 0, scale: 0.6 }}
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: slow && !down ? [1, 1.14, 1] : 1 }}
      transition={{ type: "spring", stiffness: 170, damping: 19, delay, scale: slow ? { duration: 0.8, delay: 0.1 } : undefined }}>
      <motion.div className="pc-inner" initial={{ rotateY: 180 }}
        animate={{ rotateY: down ? 180 : 0, rotateZ: slow && !down ? [0, -2, 2, 0] : 0 }}
        transition={{ rotateY: { duration: slow ? 0.8 : 0.5, delay: down ? delay + 0.25 : slow ? 0.2 : delay + 0.3, ease: slow ? [0.4, 0, 0.2, 1] : "easeInOut" }, rotateZ: { duration: 0.8 } }}>
        <div className={`pc-face ${red ? "is-red" : ""} ${isFace ? "is-face" : ""} ${c?.r === 1 ? "is-ace" : ""}`}>
          {c && (
            <>
              <span className="pc-corner"><b>{RANK[c.r]}</b><i>{SUIT[c.s]}</i></span>
              <span className="pc-mid">{isFace ? <><em>{RANK[c.r]}</em><u>{SUIT[c.s]}</u></> : SUIT[c.s]}</span>
              <span className="pc-corner br"><b>{RANK[c.r]}</b><i>{SUIT[c.s]}</i></span>
            </>
          )}
        </div>
        <div className="pc-back" />
      </motion.div>
    </motion.div>
  );
}

const CHIPS = [{ v: 5, c: "#d93b30" }, { v: 25, c: "#1f9d55" }, { v: 100, c: "#23272f" }, { v: 500, c: "#7a3fd1" }];
/** purely visual chip stack that grows with the bet */
function ChipStack({ stake }: { stake: number }) {
  const n = Math.max(1, Math.min(5, Math.ceil(Math.log10(Math.max(stake, 5) / 4) * 2)));
  const tint = stake >= 500 ? CHIPS[3] : stake >= 100 ? CHIPS[2] : stake >= 25 ? CHIPS[1] : CHIPS[0];
  return (
    <div className="bj-chips" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => (
        <motion.i key={k} className="bj-chip" style={{ ["--chip" as string]: tint.c, bottom: k * 5 }} initial={{ y: -22, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: k * 0.06, type: "spring", stiffness: 320, damping: 20 }} />
      ))}
    </div>
  );
}

/** Counts a number up from 0 (smooth), with a soft tick for wins. Writes straight to the DOM node. */
function Amount({ value, sign, win }: { value: number; sign: string; win: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let last = -1;
    const tw = tweenNumber(0, value, win ? 0.95 : 0.6, (v) => {
      el.textContent = `${sign}${v.toFixed(2)}`;
      if (win && value > 0) { const step = Math.floor((v / value) * 7); if (step !== last) { last = step; bjSound.tick(step); } }
    }, "power3.out");
    return () => { tw.kill(); el.textContent = `${sign}${value.toFixed(2)}`; };
  }, [value, sign, win]);
  return <span ref={ref} className="num" dir="ltr">{sign}{value.toFixed(2)}</span>;
}

/** Gold particles that rise from the banner on a win. */
function Particles({ n }: { n: number }) {
  return (
    <span className="bj-particles" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 3) * 0.2;
        const d = 58 + (i % 4) * 16;
        return (
          <motion.i key={i} initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{ x: Math.cos(a) * d * 1.5, y: Math.sin(a) * d - 22, scale: [0, 1.15, 0.6], opacity: [0, 1, 0] }}
            transition={{ duration: 1.05 + (i % 3) * 0.18, delay: 0.08 + (i % 5) * 0.035, ease: "easeOut" }}
            style={{ background: i % 3 === 0 ? "#fff3c4" : i % 3 === 1 ? "#ffd24a" : "#8dffb8" }} />
        );
      })}
    </span>
  );
}

/** Result banner: dark pill so text stays readable on the green felt (the old red-on-green text was not). */
function Banner({ r, title }: { r: Result; title: string }) {
  const win = r.kind === "win";
  const sign = r.kind === "win" ? "+" : r.kind === "lose" ? "−" : "";
  const t = useT();
  return (
    <motion.div className={`bj-banner is-${r.kind}`} role="status"
      initial={{ opacity: 0, y: 16, scale: 0.88 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 240, damping: 21 }}>
      {win && <Particles n={r.outcome === "blackjack" ? 22 : 12} />}
      {win && <motion.span className="bj-ring" aria-hidden="true" initial={{ opacity: 0.7, scale: 0.8 }} animate={{ opacity: 0, scale: 1.7 }} transition={{ duration: 0.9, ease: "easeOut" }} />}
      <motion.span className="bj-banner-title" initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.05 }}>{title}</motion.span>
      {r.kind !== "push" && <span className="bj-banner-amt"><Amount value={r.amount} sign={sign} win={win} /> <small>{t("points")}</small></span>}
    </motion.div>
  );
}

export default function Blackjack({ onBack }: { onBack: () => void }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const cfg = s.settings!;
  const [stake, setStake] = useState(Math.max(cfg.min_bet_pts, 10));
  const [phase, setPhase] = useState<Phase>("idle");
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [outcome, setOutcome] = useState<BjOutcome | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [stakeCp, setStakeCp] = useState(0);
  const [id, setId] = useState<string | null>(null);
  const setMsg = (m: string) => { if (m) toast(m); };
  const [busy, setBusy] = useState(false);
  const [standing, setStanding] = useState(false); // stand pressed, waiting for the server
  const [revealing, setRevealing] = useState(false); // dealer is still turning cards: banner / balance come after
  const [lossN, setLossN] = useState(0);
  const [roundN, setRoundN] = useState(0); // new key per hand → every deal flies in fresh
  const [settledCount, setSettledCount] = useState(0); // Hi-Lo total of every card already shown in finished hands (this session)

  useEffect(() => {
    const r = s.resume?.blackjack;
    if (r?.id) { setId(r.id); setPlayer(r.player); setDealer(r.dealerUp); setStakeCp(r.stakeCp); setPhase("player"); setMsg(t("restored")); }
  }, []); // eslint-disable-line

  const fail = (e: unknown) => setMsg(t(errKey(e instanceof ApiError ? e.code : "generic")));

  /** Show the cards at once, but hold the banner, balance, sound and haptics until the last card has turned. */
  const settle = (r: any, cp: number, fromDeal: boolean) => {
    const dl = (r.dealer as Card[]).length;
    const wait = r.outcome === "bust" ? 650 : dl > 2 ? 1900 + (dl - 3) * 450 : fromDeal ? 1300 : 1100;
    setSettledCount((n) => n + countOf(r.player as Card[]) + countOf(r.dealer as Card[]));
    setPlayer(r.player); setDealer(r.dealer); setOutcome(r.outcome); setPhase("done"); setRevealing(true);
    actions.reveal("blackjack", r); actions.clearResume("blackjack");
    window.setTimeout(() => {
      actions.setBalance(r.balanceCp); actions.pushHistory("blackjack", cp, r.payoutCp, r.mult);
      if (r.mult > 1) { setResult({ kind: "win", amount: (r.payoutCp - cp) / 100, outcome: r.outcome }); r.outcome === "blackjack" ? bjSound.blackjack() : bjSound.win(); winFx(r.outcome === "blackjack"); }
      else if (r.mult === 1) { setResult({ kind: "push", amount: 0, outcome: r.outcome }); bjSound.push(); }
      else { setResult({ kind: "lose", amount: cp / 100, outcome: r.outcome }); setLossN((n) => n + 1); r.outcome === "bust" ? bjSound.bust() : bjSound.lose(); loseFx(); }
      setRevealing(false);
    }, wait);
  };

  const deal = async () => {
    if (busy || revealing) return;
    const cp = Math.round(stake * 100);
    if (stake < cfg.min_bet_pts) return setMsg(t("err_min_bet"));
    if (stake > cfg.max_bet_pts) return setMsg(t("err_max_bet"));
    if (cp > s.cp) return setMsg(t("err_insufficient"));
    setBusy(true); setMsg(""); setResult(null); setOutcome(null); setPlayer([]); setDealer([]); setRoundN((n) => n + 1);
    bjSound.chip();
    try {
      const r = await getApi().game("blackjack", "start", { stakeCp: cp });
      actions.setNextCommit(r.nextCommit); setStakeCp(cp); setId(r.id); haptic.tap("medium");
      if (r.status === "done") { settle(r, cp, true); }
      else { actions.setBalance(s.cp - cp); setPlayer(r.player); setDealer(r.dealerUp); setPhase("player"); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const act = async (action: "hit" | "stand") => {
    if (phase !== "player" || busy || !id) return;
    setBusy(true); haptic.tap("light"); bjSound.tap(); if (action === "stand") setStanding(true);
    try {
      const r = await getApi().game("blackjack", action, { id });
      if (r.status === "done") settle(r, stakeCp, false); else setPlayer(r.player);
    } catch (e) { fail(e); } finally { setBusy(false); setStanding(false); }
  };

  const visibleCount = phase === "player" || phase === "idle" ? countOf(player) + countOf(dealer.slice(0, 1)) : 0;
  const running = settledCount + visibleCount;
  const label: Record<BjOutcome, string> = { blackjack: t("bj"), win: t("win"), push: t("push"), lose: t("lose"), bust: t("bust") };
  const ar = lang === "ar";
  const state = phase === "player" && standing ? (ar ? "دور الموزّع…" : "Dealer's turn…") : phase === "player" ? (ar ? "دورك" : "Your turn") : phase === "done" ? (ar ? "دور الموزّع…" : "Dealer's turn…") : (ar ? "بانتظار التوزيع" : "Ready to deal");
  const bet = phase === "idle" ? stake : stakeCp ? stakeCp / 100 : stake;
  const dealerDelay = phase === "done" && dealer.length > 2 ? 1.75 + (dealer.length - 3) * 0.45 : phase === "done" ? 1.0 : 0.7;
  const playerTone = result ? (result.kind === "win" ? "glow" : result.kind === "lose" ? "dim" : "") : "";
  const dealerTone = result && result.kind === "win" ? "dim" : "";

  return (
    <div className="game-screen">
      <GameHeader game="blackjack" title={t("blackjack")} rtp="≈88%" onBack={onBack} />

      <div className="game-area bj-table">
        <Flash trigger={lossN} color="rgba(231,76,60,.14)" />
        <div className="bj-deck" aria-hidden="true"><i /><i /><i /></div>
        <div className="bj-count" dir="ltr" title="Hi-Lo running count (this session)">
          <small>{ar ? "العدّ" : "COUNT"}</small>
          <motion.b key={running} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 18 }} className={`num ${running > 0 ? "pos" : running < 0 ? "neg" : ""}`}>{running > 0 ? `+${running}` : running}</motion.b>
        </div>
        <Hand rk={roundN} isDealer title={t("dealer")} cards={dealer} holeHidden={phase === "player"} tone={dealerTone}
          total={dealer.length && phase !== "player" ? handValue(dealer).total : dealer.length ? handValue(dealer.slice(0, 1)).total : null} totalDelay={dealerDelay} />
        <div className="bj-mid">
          <AnimatePresence mode="wait" initial={false}>
            {result ? (
              <Banner key={`b${roundN}`} r={result} title={label[result.outcome]} />
            ) : (
              <motion.div key={`s${phase}${revealing}${standing}`} className="bj-statebox" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <span className={`bj-state ${phase === "player" ? "is-turn" : ""}`}>{state}</span>
                {phase === "idle" && <span className="bj-rules">{t("bjRules")}</span>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="bj-player-zone">
          <Hand rk={roundN} title={t("you")} cards={player} tone={playerTone} bustShake={result?.outcome === "bust" ? lossN : 0}
            total={player.length ? handValue(player).total : null} totalDelay={0.7} />
          <div className="bj-bet" dir="ltr"><ChipStack stake={bet} /><span className="num">{bet}</span></div>
        </div>
      </div>

      <div className="dock">
        {phase === "player" ? (
          <div className="grid-2">
            <button type="button" className="btn btn-ghost btn-lg" disabled={busy} onClick={() => act("stand")}>{t("stand")}</button>
            <button type="button" className="btn btn-acc btn-lg" disabled={busy} onClick={() => act("hit")}>{t("hit")}</button>
          </div>
        ) : (
          <>
            <BetControls stake={stake} setStake={setStake} balancePts={s.cp / 100} disabled={busy || revealing} />
            <button type="button" className="btn btn-acc btn-lg" disabled={busy || revealing} onClick={deal}>{phase === "done" ? t("playAgain") : t("deal")}<span className="num" dir="ltr">{stake} {t("points")}</span></button>
          </>
        )}
      </div>
    </div>
  );
}

/** A hand of cards + its total badge. The badge pops when the value changes; 21 turns gold, a bust turns red. */
function Hand({ rk, title, cards, holeHidden, total, totalDelay = 0, isDealer, tone = "", bustShake = 0 }: {
  rk: number; title: string; cards: Card[]; holeHidden?: boolean; total: number | null; totalDelay?: number; isDealer?: boolean; tone?: string; bustShake?: number;
}) {
  // the dealer's total is held back until his last card has turned (no spoilers)
  const [shown, setShown] = useState<number | null>(total);
  useEffect(() => {
    if (total === null) { setShown(null); return; }
    if (totalDelay > 0) { const id = window.setTimeout(() => setShown(total), totalDelay * 1000); return () => window.clearTimeout(id); }
    setShown(total);
  }, [total, totalDelay]);

  const n = cards.length + (holeHidden && cards.length === 1 ? 1 : 0);
  const ov = n <= 4 ? 0.38 : n === 5 ? 0.5 : n === 6 ? 0.58 : n === 7 ? 0.63 : 0.67;
  const bust = shown !== null && shown > 21;
  return (
    <div className={`bj-hand ${tone ? `is-${tone}` : ""}`}>
      <div className="bj-hand-head">
        <span className="muted">{title}</span>
        {shown !== null && (
          <motion.b key={shown} className={`num bj-total ${shown === 21 ? "is-21" : ""} ${bust ? "is-bust" : ""}`}
            initial={{ scale: 1.45, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 17 }}>{shown}</motion.b>
        )}
      </div>
      <motion.div className="bj-cards" style={{ ["--ov" as string]: ov }}
        animate={bustShake ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.55, ease: "easeOut", delay: 0.05 }}>
        {cards.length === 0 && <span className="dim">—</span>}
        {[...cards.map((c, i) => <PlayingCard key={`${rk}-c${i}`} c={c} slow={isDealer && i === 1} delay={isDealer ? (i < 2 ? i * 0.3 + 0.15 : 0.9 + (i - 2) * 0.45) : (i < 2 ? i * 0.3 : 0.05)} />),
          ...(holeHidden && cards.length === 1 ? [<PlayingCard key={`${rk}-c1`} faceDown slow delay={0.45} />] : [])]}
      </motion.div>
    </div>
  );
}
