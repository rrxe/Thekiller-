import { useEffect, useRef, useState, type ReactNode } from "react";
import { actions, useStore, type GameId } from "../lib/store";
import { sfx } from "../lib/sfx";
import { errKey, useTx, useT } from "../lib/i18n";
import { GAME_META } from "../lib/games";
import AdsgramTask from "../components/AdsgramTask";
import { ApiError, getApi } from "../lib/api";
import { runInterstitial, showInterstitial } from "../lib/ads";
import { runClickInterstitial } from "../lib/adClick";
import { showAdFail } from "../lib/adNotice";
import { haptic } from "../lib/telegram";
import { toast } from "../lib/toast";
import Leaderboard from "../components/Leaderboard";
import RecentBets from "../components/RecentBets";
import PromoBanner from "../components/PromoBanner";
import { Coin, Icon } from "../components/ui";
import type { Tab } from "../components/Shell";

let promptShown = false;

const FREE_INT_ADS = 10; // first 10 ads of the day: no tap required, just watch FREE_WATCH_SEC
const FREE_WATCH_SEC = 7;
const SUPPORT_NOTICE_EVERY = 3; // show the "support us" message every 3rd free ad
let supportAck = -1; // intToday value for which the user already saw the "support us" message
let clickIntroShown = false; // the big "taps needed" notice is shown once per app session

export default function Home({ openGame, go }: { openGame: (g: GameId) => void; go: (t: Tab) => void }) {
  const t = useT();
  const tx = useTx();
  const s = useStore();
  const cfg = s.settings!;
  const [phase, setPhase] = useState<"idle" | "open" | "verify">("idle");
  const busy = phase !== "idle";
  const [promo, setPromo] = useState(false);
  const taps = useRef(0);

  // After exactly 3 interactions on Home (once per session) → quick-task card (same idea as the SLY bot).
  const onInteract = () => {
    if (promptShown) return;
    taps.current += 1;
    if (taps.current === 3) { promptShown = true; setPromo(true); }
  };

  const minSec = cfg.adsgram_int_min_seconds ?? 5;
  const intReward = cfg.adsgram_int_reward_pts ?? 0;
  const cap = cfg.adsgram_int_cap ?? 10;
  const done = Math.min(s.intToday, cap);
  const full = done >= cap;
  // The first FREE_INT_ADS ads of the day need no tap (watch 7 s only; tapping is a voluntary way to support us); every ad after that must be tapped (leaving the bot, even ~0.1 s, counts).
  const needClick = s.intToday >= FREE_INT_ADS;
  const freeSec = Math.max(FREE_WATCH_SEC, minSec);
  const hint = phase === "open" ? t("adLoading") : phase === "verify" ? t("adVerifying") : full ? t("adCapReached") : needClick ? t("adHomeClickHint") : `${t("adWatchHint")} ${freeSec}${tx(" ثواني", "s", " сек.", " सेकंड")}`;
  // Rewarded interstitial: server opens a session, we show int-59439, the server checks the minimum watch time.
  const watch = async () => {
    if (busy || full) return;
    // Big notice once per session, right before the first ad that needs a tap.
    if (needClick && !clickIntroShown) { clickIntroShown = true; sfx.click(); showAdFail("required", watch); return; }
    // Free ads: friendly message asking (not requiring) the user to tap the ad to support us. Shown once every SUPPORT_NOTICE_EVERY free ads (1st, 4th, 7th, 10th).
    if (!needClick && s.intToday % SUPPORT_NOTICE_EVERY === 0 && supportAck !== s.intToday) { sfx.click(); showAdFail("support", () => { supportAck = s.intToday; watch(); }); return; }
    setPhase("open"); sfx.click();
    let showFollowUp = false;
    try {
      const api = getApi();
      const { id } = await api.intPrepare();
      if (needClick) {
        const t0 = Date.now();
        const k = await runClickInterstitial(100, true);
        if (k.status === "unavailable") throw new ApiError("no_ads");
        if (k.status === "busy") return;
        if (k.status === "no_click") { showAdFail("noclick", watch); return; }
        if (k.status !== "ok") { showAdFail("short", watch); return; }
        setPhase("verify");
        // The server refuses a confirm sent before its minimum seconds: after a very quick tap, wait for the rest.
        const wait = minSec * 1000 + 400 - (Date.now() - t0);
        if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
        const c2 = await api.intConfirm(id);
        actions.applyTaskReward(c2); haptic.win(); sfx.coin();
        showFollowUp = true; // follow-up ad only after the reward is confirmed
        toast(`+${((c2.reward_cp ?? 0) / 100).toFixed(2)} ${t("points")}`);
        return;
      }
      const r = await runInterstitial();
      if (r.status === "unavailable") throw new ApiError("no_ads");
      if (r.status === "busy") return;
      // Once the manual ad has actually been attempted and closed, follow it
      // with the same admin-configured block used when opening a game.
      showFollowUp = true;
      if (r.status !== "watched" || r.ms < freeSec * 1000) { toast(`${t("adWatchMore")} ${freeSec}s`); return; }
      setPhase("verify");
      const c = await api.intConfirm(id);
      actions.applyTaskReward(c); haptic.win(); sfx.coin();
      toast(`+${((c.reward_cp ?? 0) / 100).toFixed(2)} ${t("points")}`);
    } catch (e) { toast(t(errKey(e instanceof ApiError ? e.code : "generic"))); }
    finally {
      if (showFollowUp) {
        setPhase("open");
        await showInterstitial("game_open");
      }
      setPhase("idle");
    }
  };

  const available = GAME_META.filter((g) => cfg.games[g.id] !== false);

  const slide = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const SLIDES = 3;
  const AUTO_MS = 5500;
  const onScroll = () => { const el = slide.current; if (el) setIdx(Math.min(SLIDES - 1, Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)))); };
  const goSlide = (i: number) => { const el = slide.current; if (!el) return; const dir = getComputedStyle(el).direction === "rtl" ? -1 : 1; el.scrollTo({ left: dir * i * el.clientWidth, behavior: "smooth" }); };
  useEffect(() => {
    const id = window.setTimeout(() => goSlide((idx + 1) % SLIDES), AUTO_MS);
    return () => clearTimeout(id);
  }, [idx]);
  const head = (icon: string, tone: string, title: string, right?: ReactNode) => <div className="sec-head">
    <span className={`sec-ico ${tone}`}><Icon name={icon} size={22} /></span><h2>{title}</h2>{right}
  </div>;

  return <div className="page home" onPointerDownCapture={onInteract}>
    <section className="banner" aria-roledescription="carousel" aria-label="ODDXS">
      <div className="banner-track" ref={slide} onScroll={onScroll}>
        <PromoBanner
          ariaLabel="1 / 3"
          className="promo-welcome"
          backgroundImage="/images/art/hero.webp"
          subtitle={t("welcomeTo")}
          title={<span className="promo-logo" dir="ltr">ODD<b>XS</b></span>}
          description={t("tagline")}
          buttonText={t("startPlaying")}
          onClick={() => { sfx.click(); go("games"); }}
        />
        <PromoBanner
          ariaLabel="2 / 3"
          className="promo-green"
          backgroundImage="/images/art/promo-ad-green.webp"
          subtitle={t("watchEarn")}
          title={t("watchAd")}
          reward={<><Coin size={18} />+{intReward} {t("points")}</>}
          buttonText={busy ? hint : t("watchNow")}
          disabled={busy || full}
          onClick={watch}
        />
        <PromoBanner
          ariaLabel="3 / 3"
          backgroundImage="/images/art/promo-invite.webp"
          subtitle={t("referralReward")}
          title={t("inviteEarn")}
          reward={<><Coin size={18} />+{(cfg.referral_reward_pts ?? 0).toLocaleString()} {t("points")}</>}
          buttonText={t("referralInvite")}
          onClick={() => { sfx.click(); go("referrals"); }}
        />
      </div>
      <div className="dots-nav" role="tablist">{Array.from({ length: SLIDES }, (_, i) => <button type="button" key={i} role="tab" aria-selected={i === idx} aria-label={`${i + 1}`} className={i === idx ? "is-on" : ""} onClick={() => goSlide(i)}><i key={i === idx ? `on${idx}` : "off"} /></button>)}</div>
    </section>

    {head("flame", "tone-orange", t("trending"), <button type="button" className="view-all" onClick={() => go("games")}>{t("viewAll")}<Icon name="arrow" size={16} className="rtl-flip" /></button>)}
    <div className="snap-row trend-row">
      {available.map((g) => <button type="button" key={g.id} className="trend-sq" aria-label={t(g.id)} onClick={() => openGame(g.id)}>
        <img src={g.square} alt="" width={480} height={480} loading="lazy" decoding="async" draggable={false} />
      </button>)}
      {!available.length && <p className="empty">{t("emptyGames")}</p>}
    </div>

    <button type="button" className={`home-ad-btn ${busy ? "is-busy" : ""} ${full ? "is-full" : ""}`} onClick={watch} disabled={busy || full}>
      <span className="had-top">
        <span className="had-ico"><Icon name="play" size={16} /></span>
        <span className="had-txt"><strong>{t("watchEarn")}</strong><small>{hint}</small></span>
        <span className="had-rew" dir="ltr"><Coin size={14} />+{intReward}</span>
      </span>
      <span className="had-prog">
        <span className="had-segs" dir="ltr" aria-hidden="true">{Array.from({ length: Math.max(1, cap) }, (_, i) => <i key={i} className={i < done ? "is-on" : ""} />)}</span>
        <b className="num" dir="ltr">{done}/{cap}</b>
      </span>
    </button>

    {head("history", "tone-blue", t("recentBets"), s.history.length > 0 ? <button type="button" className="view-all is-live" onClick={() => go("history")}>{t("viewAll")}</button> : <span className="view-all is-live">{t("liveLabel")}</span>)}
    <RecentBets limit={4} />

    <div className="list">
      <button type="button" className="list-row as-btn" onClick={() => go("referrals")}><Icon name="users" size={20} /><span className="grow">{t("referralsTitle")}</span><span className="muted num">{s.referrals}</span><Icon name="chevron" size={16} className="rtl-flip dim" /></button>
    </div>

    {head("trophy", "tone-gold", t("lbPoints"), <span className="view-all is-live">{t("lbHint")}</span>)}
    <Leaderboard kind="points" limit={5} />

    {promo && <>
      <div className="promo-backdrop" onClick={() => setPromo(false)} aria-hidden="true" />
      <div className="promo-task-card" role="dialog" aria-modal="true" aria-label={t("promoTitle")}>
        <button type="button" className="promo-task-close" onClick={() => setPromo(false)} aria-label={t("promoClose")}><Icon name="close" size={16} /></button>
        <span className="promo-task-badge" aria-hidden="true"><Icon name="gift" size={34} /></span>
        <strong className="promo-task-title">{t("promoTitle")}</strong>
        <p className="promo-task-sub">{t("promoSubtitle")}</p>
        <AdsgramTask onDone={() => window.setTimeout(() => setPromo(false), 1200)} />
      </div>
    </>}
  </div>;
}
