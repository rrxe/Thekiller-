import { useEffect, useMemo, useState } from "react";
import UiIcons from "../components/UiIcons";
import { useLanguage } from "../i18n/LanguageContext";
import "../styles/home.css";

type MiningState = {
  active: boolean;
  reward: number;
  cycleHours: number;
  startedAt: string | null;
  claimAvailableAt: string | null;
  claimReady: boolean;
};

type RedeemResult = { success: boolean; message: string };

type Props = {
  streak: number;
  mining: MiningState;
  miningBusy: boolean;
  onMining: () => void;
  onRedeemGiftCode: (code: string) => Promise<RedeemResult>;
};

type LeaderUser = { rank: number; name: string; coins: string; tier: string };
const DAILY_POINTS = 250;
const milestones = [
  { days: 3, chestKey: "milestoneCommon" },
  { days: 7, chestKey: "milestoneEpic" },
  { days: 14, chestKey: "milestoneLegendary" },
  { days: 50, chestKey: "milestoneMythic" },
] as const;

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
export default function Home({ streak, mining, miningBusy, onMining, onRedeemGiftCode }: Props) {
  const { t } = useLanguage();
  const [leaderboard, setLeaderboard] = useState<LeaderUser[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [giftCode, setGiftCode] = useState("");
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftStatus, setGiftStatus] = useState<"idle" | "success" | "error">("idle");
  const [giftMessage, setGiftMessage] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    fetch("/api/leaderboard").then((res) => res.json()).then((data) => Array.isArray(data) && setLeaderboard(data)).catch(() => {});
  }, []);

  const remainingMs = mining.active && mining.claimAvailableAt ? Math.max(0, new Date(mining.claimAvailableAt).getTime() - now) : 0;
  const claimReady = mining.active && (mining.claimReady || remainingMs <= 0);
  const currentChest = milestones.filter((item) => streak >= item.days).at(-1) ?? null;
  const nextMilestone = milestones.find((item) => item.days > streak) ?? null;
  const progressToNext = useMemo(() => {
    if (!nextMilestone) return 1;
    const previous = milestones.filter((item) => item.days < nextMilestone.days).at(-1)?.days ?? 0;
    const span = nextMilestone.days - previous;
    return span > 0 ? Math.min(1, Math.max(0, (streak - previous) / span)) : 0;
  }, [streak, nextMilestone]);

  const handleRedeemGiftCode = async () => {
    const trimmed = giftCode.trim();
    if (!trimmed || giftBusy) return;
    setGiftBusy(true);
    setGiftMessage("");
    const result = await onRedeemGiftCode(trimmed);
    setGiftBusy(false);
    setGiftStatus(result.success ? "success" : "error");
    setGiftMessage(result.message);
    if (result.success) setGiftCode("");
  };

  return (
    <section className="home-page">
      <section className="home-intro">
        <div>
          <span className="home-intro-kicker">COMICX / MINING NETWORK</span>
          <h1>{t("home.heroTitle")}</h1>
        </div>
        <span className="home-live"><i /> LIVE</span>
      </section>

      <section className="balance-stage">
        <div className="balance-stage-copy">
          <span>{t("topbar.coins")}</span>
          <strong>{mining.active ? "ACTIVE" : "READY"}</strong>
          <b>{mining.reward.toLocaleString()}</b>
          <small>{t("home.rewardEvery2h")}</small>
        </div>

        <div className="orbit-dial" aria-hidden="true">
          <div className="orbit-dial-ring ring-outer" />
          <div className="orbit-dial-ring ring-mid" />
          <div className="orbit-dial-ring ring-inner" />
          <div className="orbit-dial-sweep" />
          <div className="orbit-dial-core"><span>C</span><b>X</b></div>
          <i className="orbit-node node-a" /><i className="orbit-node node-b" />
        </div>

        <div className="balance-stage-footer">
          <span>{t("home.heroDesc")}</span>
          <span>{mining.active ? formatTime(remainingMs) : `+${mining.reward.toLocaleString()}`}</span>
        </div>
      </section>

      <button className={`mine-action ${claimReady ? "ready" : ""}`} onClick={onMining} disabled={miningBusy || (mining.active && !claimReady)}>
        <span className="mine-action-left">
          <span className="mine-action-icon"><UiIcons name={claimReady ? "coins" : "play"} /></span>
          <span>
            <small>{miningBusy ? t("home.buttonBusy") : mining.active ? t("home.statusActiveLabel") : t("home.statusReadyLabel")}</small>
            <strong>{miningBusy ? t("home.buttonBusy") : !mining.active ? t("home.buttonStart") : claimReady ? t("home.buttonClaim", { amount: mining.reward.toLocaleString() }) : t("home.buttonInProgress")}</strong>
          </span>
        </span>
        <span className="mine-action-arrow">↗</span>
      </button>

      <section className="quick-grid">
        <div className="quick-stat"><span className="quick-icon cyan"><UiIcons name="energy" /></span><div><small>MINING CYCLE</small><strong>{mining.cycleHours}H</strong></div></div>
        <div className="quick-stat"><span className="quick-icon gold"><UiIcons name="star" /></span><div><small>DAY STREAK</small><strong>{streak} {t("common.days")}</strong></div></div>
        <div className="quick-stat"><span className="quick-icon violet"><UiIcons name="coins" /></span><div><small>REWARD</small><strong>+{mining.reward.toLocaleString()}</strong></div></div>
      </section>

      <section className="code-strip">
        <div className="code-strip-head"><span>{t("home.giftEyebrow")}</span><strong>{t("home.giftTitle")}</strong></div>
        <div className="code-strip-form">
          <input className="gift-code-input" value={giftCode} onChange={(e) => setGiftCode(e.target.value)} placeholder={t("home.giftPlaceholder")} autoCapitalize="characters" disabled={giftBusy} />
          <button onClick={handleRedeemGiftCode} disabled={!giftCode.trim() || giftBusy} type="button">{giftBusy ? "..." : "REDEEM"}</button>
        </div>
        {giftMessage ? <p className={`gift-code-message ${giftStatus}`}>{giftMessage}</p> : null}
      </section>

      <section className="streak-board">
        <div className="streak-board-main">
          <div className="streak-badge"><strong>{streak}</strong><span>{t("common.days")}</span></div>
          <div><span className="section-kicker">{t("home.checkinEyebrow")}</span><h2>{t("home.checkinPoints", { points: DAILY_POINTS })}</h2><small>{t("home.checkinStatus")}</small></div>
        </div>
        <div className="streak-track"><span style={{ width: `${progressToNext * 100}%` }} /></div>
        <div className="streak-marks">
          {milestones.map((item) => <span key={item.days} className={streak >= item.days ? "done" : nextMilestone?.days === item.days ? "next" : ""}><b>{item.days}</b><small>{t(`home.${item.chestKey}`)}</small></span>)}
        </div>
        <div className="streak-foot"><span>{nextMilestone ? t("home.nextRewardIn", { days: nextMilestone.days - streak }) : t("home.allRewardsUnlocked")}</span><span>{currentChest ? t("home.chestUnlocked", { chest: t(`home.${currentChest.chestKey}`) }) : t("home.keepStreakGoing")}</span></div>
      </section>

      <section className="leaderboard-board">
        <div className="board-heading"><div><span>{t("home.leaderboardEyebrow")}</span><h2>{t("home.leaderboardTitle")}</h2></div><UiIcons name="leaderboard" /></div>
        {leaderboard.length === 0 ? <div className="leader-empty">{t("home.noLeaderboardData")}</div> : <div className="leader-table">
          {leaderboard.map((player) => <div key={player.rank} className="leader-item">
            <span className={`leader-rank rank-${player.rank}`}>{player.rank}</span>
            <div className="leader-avatar">{player.name?.slice(0,1)?.toUpperCase() || "G"}</div>
            <div className="leader-name"><strong>{player.name}</strong><small>{player.coins} {t("home.coinsSuffix")}</small></div>
            <span className={`leader-tier ${player.tier.toLowerCase()}`}>{["Common","Rare","Epic","Legendary","Mythic"].includes(player.tier) ? t(`home.tier${player.tier}`) : player.tier}</span>
          </div>)}
        </div>}
      </section>
    </section>
  );
}
