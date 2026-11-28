import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { actions, useStore } from "../lib/store";
import { getApi, ApiError } from "../lib/api";
import { fmtPts } from "../lib/format";
import { errKey, useT, useTx } from "../lib/i18n";
import { loseFx, winFx, tweenNumber } from "../lib/fx";
import { haptic, setImmersive } from "../lib/telegram";
import { sfx } from "../lib/sfx";
import { grSound } from "../lib/grSound";
import { toast } from "../lib/toast";
import { BetControls, Icon, ResultLine } from "../components/ui";
import { HowTo } from "../components/HowTo";
import { Flash, Shake, Sparkle } from "../components/fx3d";

/** Same numbers as shared/engine.ts (kept local so the screen has no extra imports). */
const STEPS = 24;
const MAX_MULT = 25;
const multAt = (picks: number) => (picks <= 0 ? 1 : Math.min(MAX_MULT, picks + 1));
/** multipliers that get a flag on the rail + a little fanfare */
const MILESTONES = [5, 10, 15, 20];
const CHIPS = [2, 5, 10, 15, 20, 25];

type Phase = "setup" | "playing" | "over";
type Reveal = { side: number; mineSide: number; safe: boolean } | null;

/** Position + size in the frame's own pixels (the art is 941 × 1672). */
const at = (x: number, y: number, w: number, h: number, fs?: number): CSSProperties =>
  ({ "--x": x, "--y": y, "--w": w, "--h": h, ...(fs ? { "--fs": fs } : {}) } as CSSProperties);

/* ───────────── little pieces of art (pure SVG, no extra files) ───────────── */
const GoldPile = () => (
  <svg viewBox="0 0 64 64" className="gr-art" aria-hidden="true">
    <defs>
      <linearGradient id="grg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF0A0" /><stop offset=".55" stopColor="#F5B400" /><stop offset="1" stopColor="#B87400" /></linearGradient>
      <linearGradient id="grg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE27A" /><stop offset="1" stopColor="#C98500" /></linearGradient>
    </defs>
    <path d="M6 54 L14 36 L28 32 L36 44 L30 56 Z" fill="url(#grg2)" stroke="#8A5A00" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M26 56 L34 30 L50 24 L60 40 L54 56 Z" fill="url(#grg1)" stroke="#8A5A00" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M18 38 L26 22 L40 18 L46 32 L36 42 Z" fill="url(#grg1)" stroke="#8A5A00" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M30 24 L38 21 M41 30 L48 29 M12 44 L18 41" stroke="#FFF7C8" strokeWidth="2" strokeLinecap="round" opacity=".85" />
  </svg>
);

const Dynamite = () => (
  <svg viewBox="0 0 64 64" className="gr-art" aria-hidden="true">
    <g strokeLinejoin="round" strokeWidth="1.2" stroke="#4A0D06">
      <rect x="10" y="26" width="13" height="30" rx="3" fill="#D8301F" transform="rotate(-10 16 41)" />
      <rect x="25" y="24" width="13" height="32" rx="3" fill="#E8412A" />
      <rect x="40" y="26" width="13" height="30" rx="3" fill="#C42A18" transform="rotate(10 46 41)" />
    </g>
    <path d="M8 40 H56" stroke="#F1D9A0" strokeWidth="3.2" opacity=".9" />
    <path d="M31 24 C31 14 42 14 44 6" fill="none" stroke="#5A3A1A" strokeWidth="2.2" strokeLinecap="round" />
    <g className="gr-spark"><circle cx="44" cy="6" r="3.4" fill="#FFD23F" /><circle cx="44" cy="6" r="1.6" fill="#fff" /></g>
  </svg>
);

/* ───────────── effects ───────────── */
/** a handful of coins popping out of a door, with a bit of gravity */
function CoinBurst() {
  const coins = useMemo(() => Array.from({ length: 10 }, () => ({
    dx: (Math.random() - 0.5) * 130, up: 45 + Math.random() * 55, down: 25 + Math.random() * 40,
    spin: (Math.random() - 0.5) * 720, d: Math.random() * 0.1, s: 0.7 + Math.random() * 0.5,
  })), []);
  return (
    <span className="gr-burst" aria-hidden="true">
      {coins.map((c, i) => (
        <motion.i key={i} className="gr-coin" initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: c.dx, y: [0, -c.up, c.down], scale: [0, c.s, c.s * 0.9], opacity: [1, 1, 0], rotateY: c.spin }}
          transition={{ duration: 0.95, delay: c.d, ease: "easeOut", times: [0, 0.4, 1] }} />
      ))}
    </span>
  );
}

/** dynamite going off: fireball, shockwave, debris, smoke */
function Blast() {
  const bits = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, d = 70 + Math.random() * 100;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 20, r: (Math.random() - 0.5) * 720, s: 0.6 + Math.random() * 0.9 };
  }), []);
  return (
    <span className="gr-blast" aria-hidden="true">
      <motion.i className="gr-fire" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: [0.2, 1.4, 1.9], opacity: [1, 0.95, 0] }} transition={{ duration: 0.75, ease: "easeOut" }} />
      <motion.i className="gr-ring" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 2.8, opacity: 0 }} transition={{ duration: 0.65, ease: "easeOut" }} />
      <motion.i className="gr-smoke" initial={{ scale: 0.4, opacity: 0.75, y: 0 }} animate={{ scale: 2.2, opacity: 0, y: -70 }} transition={{ duration: 1.3, ease: "easeOut" }} />
      {bits.map((b, i) => (
        <motion.i key={i} className="gr-debris" initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 90], scale: [0, b.s, b.s * 0.7], opacity: [1, 1, 0], rotate: b.r }}
          transition={{ duration: 0.9, ease: "easeOut", times: [0, 0.45, 1] }} />
      ))}
    </span>
  );
}

/** coins falling across the whole stage on a win (pure CSS animation: cheap on phones) */
function CoinRain({ trigger, big }: { trigger: number; big: boolean }) {
  const n = big ? 34 : 20;
  const coins = useMemo(() => Array.from({ length: n }, () => ({ x: Math.random() * 100, d: Math.random() * 0.55, t: 1.1 + Math.random() * 0.9, s: 0.7 + Math.random() * 0.8 })), [trigger, n]); // eslint-disable-line
  if (!trigger) return null;
  return (
    <div className="gr-rain" aria-hidden="true" key={trigger}>
      {coins.map((c, i) => <i key={i} className="gr-coin" style={{ left: `${c.x}%`, "--d": `${c.d}s`, "--t": `${c.t}s`, "--k": c.s } as CSSProperties} />)}
    </div>
  );
}

/** One of the two mine-shaft doors: a heavy wooden leaf that swings open into the dark. */
function Door({ side, kind, ajar, muted, hit, idle, disabled, onPick, label, delay }: {
  side: 0 | 1; kind: "hidden" | "gold" | "mine"; ajar: boolean; muted: boolean; hit: boolean; idle: boolean;
  disabled: boolean; onPick: () => void; label: string; delay: number;
}) {
  const rm = useReducedMotion();
  const open = kind !== "hidden";
  const dir = side === 0 ? 1 : -1;               // left door hinges on the left, right door on the right
  const angle = open ? 78 * dir : ajar ? 13 * dir : 0;
  const bright = open ? 0.5 : ajar ? 0.88 : 1;
  const heavy = { type: "spring" as const, stiffness: 70, damping: 11, mass: 1.4, delay };
  const quick = { type: "spring" as const, stiffness: 240, damping: 21, mass: 0.8 };
  return (
    <motion.button type="button" className={`gr-door is-${kind} ${muted ? "is-muted" : ""} ${hit ? "is-hit" : ""} ${idle ? "is-idle" : ""}`}
      style={at(side === 0 ? 60 : 361, 490, 280, 420)} disabled={disabled} onClick={onPick}
      whileTap={disabled || rm ? undefined : { scale: 0.96, y: 3 }} transition={{ type: "spring", stiffness: 400, damping: 22 }} aria-label={label}>
      <span className="gr-door-frame" aria-hidden="true" />
      <span className="gr-door-inner">
        {open && <span className="gr-glow" aria-hidden="true" />}
        {open && kind === "gold" && !muted && <span className="gr-rays" aria-hidden="true" />}
        {open && (
          <motion.span className="gr-face" initial={{ scale: 0.3, opacity: 0, y: 24 }}
            animate={kind === "mine" && !muted ? { scale: 1, opacity: 1, y: 0, rotate: [0, -6, 6, -5, 5, 0] } : { scale: 1, opacity: 1, y: 0 }}
            transition={rm ? { duration: 0.01 } : { type: "spring", stiffness: 160, damping: 12, mass: 0.9, delay: delay + 0.2, rotate: { duration: 0.45, delay: delay + 0.2, ease: "easeInOut" } }}>
            {kind === "gold" ? <GoldPile /> : <Dynamite />}
            {!muted && kind === "gold" && <Sparkle color="#FFD84A" />}
          </motion.span>
        )}
      </span>
      <motion.span className="gr-leaf" aria-hidden="true" style={{ transformOrigin: side === 0 ? "0% 50%" : "100% 50%" }}
        initial={false} animate={{ rotateY: angle, filter: `brightness(${bright})` }} transition={rm ? { duration: 0.01 } : open ? heavy : quick}>
        <span className="gr-plate"><span className="gr-q">?</span></span>
      </motion.span>
      {open && kind === "gold" && !muted && !rm && <CoinBurst />}
      {hit && !rm && <Blast />}
    </motion.button>
  );
}

export default function GoldRush({ onBack }: { onBack: () => void }) {
  const t = useT();
  const tx = useTx();
  const rm = useReducedMotion();
  const s = useStore();
  const cfg = s.settings!;
  const [stake, setStake] = useState(Math.max(cfg.min_bet_pts, 10));
  const [phase, setPhase] = useState<Phase>("setup");
  const [picks, setPicks] = useState(0);
  const [stakeCp, setStakeCp] = useState(0);
  const [reveal, setReveal] = useState<Reveal>(null);
  const [pending, setPending] = useState<number | null>(null); // door that was just tapped, waiting for the server
  const [result, setResult] = useState<{ kind: "win" | "lose"; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [boomN, setBoomN] = useState(0);
  const [winN, setWinN] = useState(0);
  const [bigWin, setBigWin] = useState(false);
  const [pairKey, setPairKey] = useState(0);
  const [how, setHow] = useState(false);
  const [shownPay, setShownPay] = useState(0);
  const shownRef = useRef(0);
  const tween = useRef<ReturnType<typeof tweenNumber> | null>(null);
  const id = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const setMsg = (m: string) => { if (m) toast(m); };

  const mult = multAt(picks);
  const nextMult = multAt(picks + 1);
  const payout = Math.floor(stakeCp * mult + 1e-9);
  const targetPay = phase === "over" && result?.kind === "lose" ? 0 : payout;

  // the whole frame is the screen: go full-screen while this game is open
  useEffect(() => { setImmersive(true); return () => setImmersive(false); }, []);

  useEffect(() => () => { timers.current.forEach((x) => window.clearTimeout(x)); tween.current?.kill(); }, []);

  // payout counter rolls to its new value instead of jumping
  useEffect(() => {
    tween.current?.kill();
    tween.current = tweenNumber(shownRef.current, targetPay, 0.6, (v) => { shownRef.current = v; setShownPay(v); });
  }, [targetPay]);

  // restore an open round (the app was closed mid-game)
  useEffect(() => {
    const r = s.resume?.goldrush;
    if (r?.id) { id.current = r.id; setPicks(r.picks); setStakeCp(r.stakeCp); setPhase("playing"); setMsg(t("restored")); }
  }, []); // eslint-disable-line

  const fail = (e: unknown) => setMsg(t(errKey(e instanceof ApiError ? e.code : "generic")));

  const start = async () => {
    if (busy) return;
    const cp = Math.round(stake * 100);
    if (stake < cfg.min_bet_pts) return setMsg(t("err_min_bet"));
    if (stake > cfg.max_bet_pts) return setMsg(t("err_max_bet"));
    if (cp > s.cp) return setMsg(t("err_insufficient"));
    setBusy(true);
    try {
      const r = await getApi().game("goldrush", "start", { stakeCp: cp });
      id.current = r.id; actions.setBalance(r.balanceCp); actions.setNextCommit(r.nextCommit);
      setPicks(0); setReveal(null); setPending(null); setResult(null); setStakeCp(cp); setPhase("playing"); setPairKey((k) => k + 1);
      haptic.tap("medium"); grSound.start(); later(grSound.whoosh, 120);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  /** money + history update right away (so nothing is lost if the player leaves mid-animation) */
  const settle = (r: any, won: boolean) => {
    actions.setBalance(r.balanceCp); actions.reveal("goldrush", r); actions.clearResume("goldrush");
    actions.pushHistory("goldrush", stakeCp, won ? r.payoutCp : 0, won ? r.mult : 0);
  };
  /** the "round over" screen — shown once the door / blast animation has played */
  const present = (r: any, won: boolean) => {
    setPhase("over"); setBusy(false);
    if (won) {
      setResult({ kind: "win", amount: (r.payoutCp - stakeCp) / 100 });
      setBigWin(r.mult >= 8); setWinN((n) => n + 1);
      grSound.cashout(r.mult); if (r.mult >= 8) later(sfx.bigWin, 250);
      winFx(r.mult >= 5);
    } else {
      setResult({ kind: "lose", amount: stakeCp / 100 }); loseFx();
    }
  };

  const pick = async (side: 0 | 1) => {
    if (phase !== "playing" || busy) return;
    // the door reacts the instant it is touched — it cracks open while the server answers
    setBusy(true); setPending(side); haptic.tap("light"); grSound.knock(); grSound.creak(0.04);
    let keepBusy = false;
    try {
      const r = await getApi().game("goldrush", "pick", { id: id.current, side });
      setPending(null);
      setReveal({ side, mineSide: r.mineSide, safe: r.safe });
      grSound.thud(0.3);
      if (!r.safe) {
        keepBusy = true;
        grSound.fuse(0.3); settle(r, false);
        later(() => { setBoomN((n) => n + 1); grSound.boom(); haptic.tap("heavy"); }, 520);
        later(() => present(r, false), 1050);
        return;
      }
      setPicks(r.picks); grSound.gold(r.picks - 1, 0.22);
      if (MILESTONES.includes(r.picks + 1)) later(() => { grSound.milestone(MILESTONES.indexOf(r.picks + 1)); haptic.win(); }, 420);
      if (r.status === "won") { keepBusy = true; settle(r, true); later(() => present(r, true), 900); return; }
      // let the player see what was behind both doors, then slide the next pair in
      keepBusy = true;
      later(() => { setReveal(null); setPairKey((k) => k + 1); grSound.whoosh(); setBusy(false); }, 1050);
    } catch (e) { setPending(null); fail(e); } finally { if (!keepBusy) setBusy(false); }
  };

  const cash = async () => {
    if (phase !== "playing" || busy || picks < 1) return;
    setBusy(true);
    try {
      const r = await getApi().game("goldrush", "cashout", { id: id.current });
      const next = Array.isArray(r.layout) && r.picks < STEPS ? r.layout[r.picks] : -1;
      setReveal(next >= 0 ? { side: -1, mineSide: next, safe: true } : null);
      settle(r, true); present(r, true);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const doorKind = (side: number): "hidden" | "gold" | "mine" => {
    if (!reveal) return "hidden";
    return reveal.mineSide === side ? "mine" : "gold";
  };
  const doorDelay = (side: number) => (reveal && reveal.side === side ? 0 : 0.34);

  const message = phase === "setup"
    ? tx("ضع رهانك وابدأ الحفر", "Place a bet to start digging", "Сделайте ставку", "बेट लगाकर शुरू करें")
    : phase === "over"
      ? (result?.kind === "win" ? tx("ربحت الذهب!", "You struck gold!", "Золото ваше!", "सोना मिल गया!") : tx("لغم! انتهت الجولة", "Boom! Round over", "Бум! Раунд окончен", "धमाका! राउंड खत्म"))
      : reveal ? (reveal.safe ? tx("ذهب! 🪙", "Gold! 🪙", "Золото! 🪙", "सोना! 🪙") : tx("لغم! 💥", "Mine! 💥", "Мина! 💥", "माइन! 💥"))
        : tx("اختر باباً: ذهب أو لغم؟", "Pick a door: gold or mine?", "Выберите дверь", "दरवाज़ा चुनें");

  const doorsOff = phase !== "playing" || busy;
  const trackOn = phase === "setup" ? 0 : picks;
  const pct = (trackOn / STEPS) * 100;
  const trail = Math.min(trackOn, 12);

  const dust = useMemo(() => Array.from({ length: 12 }, () => ({ l: Math.random() * 100, t: Math.random() * 100, d: Math.random() * 8, s: 7 + Math.random() * 9, sz: 2 + Math.random() * 3 })), []);

  return (
    <div className="game-screen gr-screen">
      <Shake trigger={rm ? 0 : boomN} className="gr-stage" power={1.5}>
        <div className="gr-bg" aria-hidden="true" />
        <Flash trigger={boomN} color="rgba(255,130,40,.55)" />

        {/* wooden header that fills the strip above the art (so there is never an empty / smeared band) */}
        <div className="gr-top" dir="ltr">
          <button type="button" className="gr-fbtn" onClick={onBack} aria-label={t("back")}><Icon name="back" size={16} /></button>
          <div className="gr-top-title">
            <b>{t("goldrush")}</b>
            <span className="num">RTP ≤100%</span>
          </div>
          <span className="gr-bal num"><i>P</i>{fmtPts(s.cp)}</span>
          <button type="button" className="gr-fbtn" onClick={() => setHow(true)} aria-label={t("howTo")}><Icon name="help" size={16} /></button>
        </div>
        <HowTo game="goldrush" open={how} onClose={() => setHow(false)} />

        {/* atmosphere: flickering lantern + drifting dust */}
        <span className="gr-lantern" style={at(752, 320, 220, 220)} aria-hidden="true" />
        {!rm && <div className="gr-dust" aria-hidden="true">{dust.map((p, i) => <i key={i} style={{ left: `${p.l}%`, top: `${p.t}%`, width: p.sz, height: p.sz, animationDelay: `-${p.d}s`, animationDuration: `${p.s}s` }} />)}</div>}

        {/* top-left plate: current multiplier (covers the frame's baked-in "0$") */}
        <div className="gr-at gr-mult num" style={at(112, 84, 104, 68, 44)} dir="ltr" aria-live="polite">
          <motion.b key={mult} initial={rm ? false : { scale: 1.8, y: -6 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 280, damping: 13 }}>{mult}x</motion.b>
        </div>

        {/* message bar */}
        <div className="gr-at gr-bar" style={at(134, 222, 552, 72, 31)}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={message} className="gr-bar-msg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.16 }}>{message}</motion.span>
          </AnimatePresence>
          {phase !== "setup" && <b className="gr-bar-pay num" dir="ltr">{fmtPts(shownPay)}</b>}
        </div>

        {/* ladder: a rail that fills with gold, a nugget riding its head, flags at the milestones */}
        <div className="gr-at gr-ladder" style={at(60, 336, 580, 110, 34)} dir="ltr">
          <div className="gr-ladder-top num"><b>{mult}x</b><span>→</span><b className="is-next">{phase === "over" ? "—" : `${nextMult}x`}</b><small>{trackOn}/{STEPS}</small></div>
          <div className="gr-rail" aria-hidden="true">
            <motion.div className="gr-rail-fill" initial={false} animate={{ scaleX: trackOn / STEPS }} transition={rm ? { duration: 0.01 } : { type: "spring", stiffness: 90, damping: 16, mass: 1.2 }} />
            {MILESTONES.map((m) => <i key={m} className={`gr-flag ${trackOn >= m - 1 ? "is-on" : ""}`} style={{ left: `${((m - 1) / STEPS) * 100}%` }} />)}
            <motion.span className="gr-nugget" initial={false} animate={{ left: `${pct}%` }} transition={rm ? { duration: 0.01 } : { type: "spring", stiffness: 90, damping: 16, mass: 1.2 }} />
          </div>
        </div>

        {/* the two doors — each pair slides in from below, the old one drops away */}
        <AnimatePresence initial={false}>
          <motion.div key={pairKey} className="gr-pair"
            initial={{ y: 80, opacity: 0, scale: 0.94 }} animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.95, transition: { duration: 0.26, ease: "easeIn" } }}
            transition={rm ? { duration: 0.01 } : { type: "spring", stiffness: 130, damping: 17, mass: 1.15 }}>
            {([0, 1] as const).map((sd) => (
              <Door key={sd} side={sd} kind={doorKind(sd)} ajar={pending === sd} muted={!!reveal && reveal.side !== sd}
                hit={!!reveal && !reveal.safe && reveal.side === sd} idle={phase === "setup"} disabled={doorsOff} onPick={() => pick(sd)}
                delay={doorDelay(sd)} label={sd === 0 ? tx("الباب الأيسر", "Left door", "Левая дверь", "बायाँ दरवाज़ा") : tx("الباب الأيمن", "Right door", "Правая дверь", "दायाँ दरवाज़ा")} />
            ))}
          </motion.div>
        </AnimatePresence>

        {/* parchment strip under the doors: payout steps before the round, the gold you've dug up during it */}
        <div className="gr-at gr-strip num" style={at(60, 948, 580, 96, 30)} dir="ltr">
          {phase === "setup"
            ? CHIPS.map((c) => <span key={c} className="gr-chip">{c}x</span>)
            : <>
                {Array.from({ length: trail }, (_, i) => <motion.i key={i} className="gr-chip-coin" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 12 }} />)}
                {trackOn > 12 && <small>+{trackOn - 12}</small>}
              </>}
        </div>

        {phase === "over" && result && (
          <motion.div className="gr-at gr-result" style={at(60, 1070, 580, 72)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 18 }}>
            <ResultLine kind={result.kind} amount={result.amount} label={result.kind === "win" ? t("youWon") : t("youLost")} />
          </motion.div>
        )}

        <CoinRain trigger={winN} big={bigWin} />
      </Shake>

      <div className="dock gr-dock">
        {phase === "playing" ? (
          <button type="button" className="btn btn-win btn-lg cashout" disabled={picks === 0 || busy} onClick={() => { haptic.tap("heavy"); cash(); }}>
            <span>{t("cashOut")}</span><b className="num" dir="ltr">+{fmtPts(payout)}</b>
          </button>
        ) : (
          <>
            <BetControls stake={stake} setStake={setStake} balancePts={s.cp / 100} disabled={busy} />
            <button type="button" className="btn btn-acc btn-lg" disabled={busy} onClick={start}>{phase === "over" ? t("playAgain") : t("start")}<span className="num" dir="ltr">{stake} {t("points")}</span></button>
          </>
        )}
      </div>
    </div>
  );
}
