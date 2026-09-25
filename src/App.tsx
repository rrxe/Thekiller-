import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import Background from "./components/Background";
import BottomNav from "./components/BottomNav";
import TopBar from "./components/TopBar";

import Home from "./pages/Home";
import Tasks from "./pages/Tasks";
import Referrals from "./pages/Referrals";
import Profile from "./pages/Profile";
import SplashScreen from "./components/SplashScreen";

import ExchangeModal from "./modals/ExchangeModal";
import WithdrawalModal from "./modals/WithdrawalModal";
import WithdrawalChannelModal from "./components/WithdrawalChannelModal";
import { useLanguage } from "./i18n/LanguageContext";

export type Page = "home" | "tasks" | "referrals" | "profile";
type ActivityTone = "info" | "reward" | "exchange";

type Activity = {
  id: string;
  title: string;
  meta: string;
  tone: ActivityTone;
};

type WalletState = {
  coins: number;
  usdt: number;
  spent: number;
  walletAddress: string | null;
};



type MiningState = {
  active: boolean;
  reward: number;
  cycleHours: number;
  startedAt: string | null;
  claimAvailableAt: string | null;
  claimReady: boolean;
};

type WithdrawalHistoryEntry = {
  id: number;
  amount: number;
  method: "binance" | "bnb";
  target: string | null;
  bnbAmount: number | null;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
};

const MINING_CACHE_KEY = "stormy.mining.cache.v1";


function loadCachedMining(): MiningState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MINING_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCachedMining(mining: MiningState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MINING_CACHE_KEY, JSON.stringify(mining));
  } catch {}
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getInitData() {
  const tg = (window as any).Telegram?.WebApp;
  return tg?.initData || "";
}

const DEVICE_ID_KEY = "stormy.device_id.v1";

// معرّف جهاز ثابت يتولّد مرة وحدة ويبقى محفوظ بـ localStorage تبع
// الـ WebView. يبقى نفسه حتى لو المستخدم بدّل شبكة الإنترنت أو بدّل
// حساب تيليجرام بنفس تثبيت التطبيق - يستخدم مع IP لمنع تعدد الحسابات.
function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "";

  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);

    if (!id) {
      id =
        (window.crypto?.randomUUID?.() as string | undefined) ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
          .toString(16)
          .slice(2)}`;

      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }

    return id;
  } catch {
    return "";
  }
}


// هاش بسيط وسريع (FNV-1a 32-bit) نستخدمه بس عشان نضغط بصمة الـ
// canvas/WebGL (اللي أصلها نص طويل base64) لسطر قصير قبل ما ننزلها
// جوا X-Client-Signals - عشان ما نتجاوز حد الـ2000 حرف اللي السيرفر
// يقبله (getClientSignalsHash بـ api/auth/me.js) ونعطل الفحص كامل.
function hashString32(input: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

// بصمة canvas حقيقية - رسم نص/شكل بسيط وقراءة النتيجة كـ pixels،
// اللي تختلف فعلياً حسب الـGPU/driver/font rendering للجهاز، وأصعب
// بكثير على المستخدم إنه يزوّرها مقارنة بإعدادات المتصفح الظاهرة
// (userAgent/timezone/language) اللي نجمعها أصلاً تحت.
function getCanvasFingerprint() {
  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return ""

    canvas.width = 220
    canvas.height = 30

    ctx.textBaseline = "top"
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = "#f60"
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = "#069"
    ctx.fillText("STORMY-fp #canvas", 2, 15)
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)"
    ctx.fillText("STORMY-fp #canvas", 4, 17)

    return hashString32(canvas.toDataURL())
  } catch {
    return ""
  }
}

// بصمة WebGL (اسم كرت الشاشة/الـdriver الفعلي) - نفس فكرة الـcanvas،
// بس مصدرها الـGPU نفسه بدل رسم بكسلات.
function getWebglFingerprint() {
  try {
    const canvas = document.createElement("canvas")
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null)
    if (!gl) return ""

    const dbg = gl.getExtension("WEBGL_debug_renderer_info")
    const vendor = dbg
      ? gl.getParameter((dbg as any).UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR)
    const renderer = dbg
      ? gl.getParameter((dbg as any).UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)

    return hashString32(`${vendor}~${renderer}`)
  } catch {
    return ""
  }
}

function getClientSignals() {
  if (typeof window === "undefined") return ""

  try {
    const nav = window.navigator
    const screenInfo = window.screen

    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || ""

    return JSON.stringify({
      userAgent: nav.userAgent || "",
      platform: (nav as any).platform || "",
      language: nav.language || "",
      timezone,
      screen:
        `${screenInfo?.width || 0}x${screenInfo?.height || 0}x${window.devicePixelRatio || 1}`,
      colorDepth:
        Number(screenInfo?.colorDepth || 0),
      hardwareConcurrency:
        Number(nav.hardwareConcurrency || 0),
      deviceMemory:
        Number((nav as any).deviceMemory || 0),
      canvas:
        getCanvasFingerprint(),
      webgl:
        getWebglFingerprint(),
    })
  } catch {
    return ""
  }

}

async function callApi(path: string, options: RequestInit = {}) {
  const initData = getInitData();
  const res = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `tga ${initData}`,
      "X-Device-Id": getOrCreateDeviceId(),
      "X-Client-Signals": getClientSignals(),
      "Cache-Control": "no-cache",
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}


export default function App() {
  const { t } = useLanguage();
  const [page, setPage] = useState<Page>("home");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const [wallet, setWallet] = useState<WalletState>({
    coins: 0,
    usdt: 0,
    spent: 0,
    walletAddress: null,
  });

  const [streak, setStreak] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");

  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [splashProgress, setSplashProgress] = useState(6);
  const [withdrawalChannelOpen, setWithdrawalChannelOpen] = useState(false);
  const [resumeWithdrawalAfterChannel, setResumeWithdrawalAfterChannel] = useState(false);

  useEffect(() => {
    if (!splashVisible || bootError) return;

    const id = window.setInterval(() => {
      setSplashProgress((prev) => (prev >= 94 ? prev : prev + 0.9));
    }, 120);

    const maxSplashId = window.setTimeout(() => {
      setSplashProgress(100);
      setSplashFading(true);
      window.setTimeout(() => setSplashVisible(false), 450);
    }, 6000);

    return () => {
      window.clearInterval(id);
      window.clearTimeout(maxSplashId);
    };
  }, [splashVisible, bootError]);

  useEffect(() => {
    if (bootError) {
      setSplashVisible(false);
      return;
    }
    if (!booting && splashVisible) {
      setSplashProgress(100);
      const fadeTimer = setTimeout(() => setSplashFading(true), 250);
      const hideTimer = setTimeout(() => setSplashVisible(false), 700);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [booting, bootError, splashVisible]);

  useEffect(() => {
    if (!splashVisible && !bootError) {
      setWithdrawalChannelOpen(true);
    }
  }, [splashVisible, bootError]);
  const [mining, setMining] = useState<MiningState>(
    loadCachedMining() ?? {
      active: false,
      reward: 0,
      cycleHours: 2,
      startedAt: null,
      claimAvailableAt: null,
      claimReady: false,
    }
  );
  const [miningBusy, setMiningBusy] = useState(false);
  const [miningToast, setMiningToast] = useState("");


  const [duplicateNotice, setDuplicateNotice] = useState(false);
  const duplicateNoticeDismissedRef = useRef(false);
  const [channelLeftNotice, setChannelLeftNotice] = useState("");

  // بيانات الإحالة: تتحمل مرة وحدة مع بيانات اللاعب الرئيسية
  // (أثناء شاشة الـ loading الرئيسية) بدل ما تعمل fetch خاص بها كل مرة تفتح صفحة Referrals
  const [telegramId, setTelegramId] = useState("");
  const [referralsCount, setReferralsCount] = useState(0);
  const [referralRewardUsdt, setReferralRewardUsdt] = useState(0.01);
  const [referralRequiredTasks, setReferralRequiredTasks] = useState(5);

  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalHistoryEntry[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);




  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page]);
  const loadPlayerData = async (requestOptions: RequestInit = {}) => {
    const data = await callApi("/api/auth/me", { method: "GET", ...requestOptions });

    setWallet((prev) => ({
      ...prev,
      coins: data.coins ?? 0,
      usdt: data.usdtBalance ?? 0,
      walletAddress: data.walletAddress ?? null,
    }));
    setStreak(data.streak ?? 0);
    setWithdrawalHistory(Array.isArray(data.withdrawalHistory) ? data.withdrawalHistory : []);
    setTelegramId(String(data.telegramId ?? ""));
    setReferralsCount(Number(data.referralsCount ?? 0));
    setReferralRewardUsdt(Number(data.referralRewardUsdt ?? 0.01));
    setReferralRequiredTasks(Number(data.referralRequiredTasks ?? 5));

    if (data.membershipVerified === false) {

    } else {

    }

    if (data.isDuplicateDevice && !duplicateNoticeDismissedRef.current) {
      setDuplicateNotice(true);
    }

    if (data.mining) {
      setMining(data.mining);
      saveCachedMining(data.mining);
    }

    if (Array.isArray(data.channelTasksReset) && data.channelTasksReset.length > 0) {
      try {
        const raw = window.localStorage.getItem("stormy.tasks.progress.v3");
        const parsed = raw ? JSON.parse(raw) : {};
        for (const taskId of data.channelTasksReset) {
          delete parsed[String(taskId)];
        }
        window.localStorage.setItem("stormy.tasks.progress.v3", JSON.stringify(parsed));
      } catch {}

      window.dispatchEvent(
        new CustomEvent("stormy:channel-tasks-reset", { detail: data.channelTasksReset })
      );

      setChannelLeftNotice(
        data.channelTasksReset.length === 1
          ? t("app.channelLeftSingle")
          : t("app.channelLeftMultiple", { count: data.channelTasksReset.length })
      );
    }

    return data;
  };

  useEffect(() => {
    if (!miningToast) return;
    const timer = window.setTimeout(() => setMiningToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [miningToast]);

  const refreshMining = async () => {
    const data = await callApi("/api/auth/me", { method: "GET" });
    if (data.mining) {
      setMining(data.mining);
      saveCachedMining(data.mining);
    }
    return data.mining as MiningState | undefined;
  };

  const handleMining = async () => {
    if (miningBusy) return;

    setMiningBusy(true);
    setMiningToast("");

    try {
      if (!mining.active) {
        const started = await callApi("/api/auth/me", {
          method: "POST",
          body: JSON.stringify({ action: "mining_start" }),
        });

        if (started.mining) {
          setMining(started.mining);
          saveCachedMining(started.mining);
        }

        setMiningToast(t("app.miningStarted"));
        loadPlayerData().catch(() => {});
        return;
      }

      if (!mining.claimReady) {
        throw new Error(t("app.miningCycleNotReady"));
      }

      const claimed = await callApi("/api/auth/me", {
        method: "POST",
        body: JSON.stringify({ action: "mining_claim" }),
      });

      if (claimed.success) {
        const reward = Number(claimed.reward || mining.reward);

        setWallet((prev) => ({ ...prev, coins: prev.coins + reward }));
        pushActivity(
          t("app.miningRewardTitle", { amount: reward.toLocaleString() }),
          t("app.miningRewardMeta"),
          "reward"
        );

        setMining(claimed.mining);
        saveCachedMining(claimed.mining);
        setMiningToast(t("app.miningRewardToast", { amount: reward.toLocaleString() }));
        loadPlayerData().catch(() => {});
      }
    } catch (err: any) {
      setMiningToast(err?.message || t("app.miningActionFailed"));
      try {
        await refreshMining();
      } catch {}
    } finally {
      setMiningBusy(false);
    }
  };

  // الاشتراك الإجباري معطّل — لا يوجد تحقق عند فتح البوت;

  const dismissDuplicateNotice = () => {
    duplicateNoticeDismissedRef.current = true;
    setDuplicateNotice(false);
  };

  const dismissChannelLeftNotice = () => {
    setChannelLeftNotice("");
  };

  const pushActivity = (title: string, meta: string, tone: ActivityTone) => {
    setActivities((prev) => [{ id: makeId(), title, meta, tone }, ...prev].slice(0, 8));
  };

  useEffect(() => {
    let cancelled = false;
    const bootController = new AbortController();
    const bootTimeoutId = window.setTimeout(() => bootController.abort(), 8000);

    loadPlayerData({ signal: bootController.signal })
      .then(async (data) => {
        if (cancelled) return;

        if (!data.claimedToday) {
          try {
            const checkin = await callApi("/api/daily-checkin", { method: "POST" });
            if (cancelled) return;

            if (checkin.success) {
              setWallet((prev) => ({ ...prev, coins: checkin.coins }));
              setStreak(checkin.streak ?? data.streak ?? 0);
              pushActivity(
                t("app.dailyCheckinTitle", { amount: checkin.reward }),
                t("app.dailyCheckinMeta"),
                "reward"
              );
            }
          } catch {
            // فشل صامت هنا؛ يعاد تلقائياً بالمرة الجاية
          }
        }
      })
      .catch((err) => {
        if (cancelled || bootController.signal.aborted) return;
        const msg = String(err?.message || "");
        setBootError(
          msg.includes("authentication")
            ? t("app.bootErrorAuth")
            : t("app.bootErrorGeneric")
        );
      })
      .finally(() => {
        window.clearTimeout(bootTimeoutId);
        if (!cancelled) setBooting(false);
      });

    const refreshPlayerData = async () => {
      try {
        await loadPlayerData();
      } catch {
        // تجاهل فشل التحديث الخلفي
      }
    };

    const intervalId = window.setInterval(refreshPlayerData, 15 * 1000);
window.addEventListener("focus", refreshPlayerData);

    return () => {
      cancelled = true;
      bootController.abort();
      window.clearTimeout(bootTimeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshPlayerData);
    };
  }, []);

  const handleTaskReward = (amount: number, title: string, meta: string) => {
    setWallet((prev) => ({ ...prev, coins: prev.coins + amount }));
    pushActivity(title, meta, "reward");
    loadPlayerData().catch(() => {});
  };

  const handleExchange = async (amountCoins: number) => {
    if (amountCoins <= 0 || amountCoins > wallet.coins) return;

    try {
      const data = await callApi("/api/exchange", {
        method: "POST",
        body: JSON.stringify({ amountCoins }),
      });

      setWallet((prev) => ({
        ...prev,
        coins: data.coins,
        usdt: data.usdtBalance,
        spent: prev.spent + amountCoins,
      }));

      pushActivity(
        t("app.exchangeCompletedTitle"),
        t("app.exchangeCompletedMeta", { coins: amountCoins.toLocaleString(), usdt: data.usdtGained }),
        "exchange"
      );

      loadPlayerData().catch(() => {});
    } catch (err: any) {
      pushActivity(t("app.exchangeFailedTitle"), err.message, "info");
    }
  };

  const handleRedeemGiftCode = async (code: string) => {
    try {
      const data = await callApi("/api/gift-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      setWallet((prev) => ({ ...prev, coins: data.coins }));

      pushActivity(
        t("app.giftCodeRedeemedTitle"),
        t("app.giftCodeRedeemedMeta", { amount: Number(data.rewardCoins || 0).toLocaleString() }),
        "reward"
      );

      loadPlayerData().catch(() => {});

      return {
        success: true,
        message: t("app.giftCodeReceived", { amount: Number(data.rewardCoins || 0).toLocaleString() }),
      };
    } catch (err: any) {
      return { success: false, message: err.message || t("app.giftCodeFailed") };
    }
  };

  const handleWithdraw = async (
    amount: number,
    method: "binance" | "bnb",
    target: string
  ) => {
    if (amount <= 0 || amount > wallet.usdt) return;

    try {
      const data = await callApi("/api/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount, method, target }),
      });

      setWallet((prev) => ({ ...prev, usdt: data.usdtBalance }));

      pushActivity(
        t("app.withdrawalRequestedTitle"),
        method === "binance"
          ? t("app.withdrawalToBinance", { amount: amount.toFixed(4), target })
          : t("app.withdrawalToGram", { amount: amount.toFixed(4), target: `${target.slice(0, 6)}...${target.slice(-4)}` }),
        "exchange"
      );

      loadPlayerData().catch(() => {});
    } catch (err: any) {
      pushActivity(t("app.withdrawalFailedTitle"), err.message, "info");
    }
  };


  const handleWalletConnected = (address: string) => {
    setWallet((prev) => ({ ...prev, walletAddress: address }));
  };

  const handleWalletDisconnected = () => {
    setWallet((prev) => ({ ...prev, walletAddress: null }));
  };

  const lifetimeCoins = useMemo(() => wallet.coins + wallet.spent, [wallet.coins, wallet.spent]);

  if (splashVisible) {
    return <SplashScreen progress={splashProgress} fading={splashFading} />;
  }

  if (bootError) {
    return (
      <div className="app">
        <Background />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#eaf4f2",
            padding: 24,
            textAlign: "center",
          }}
        >
          {bootError}
        </div>
      </div>
    );
  }


  return (
    <div className="app">
      <Background />
      <TopBar page={page} coins={wallet.coins} usdt={wallet.usdt} />

      {duplicateNotice ? (
        <div className="app-toast error">
          <span>{t("app.duplicateNotice")}</span>
          <button onClick={dismissDuplicateNotice} aria-label={t("app.dismiss")}>×</button>
        </div>
      ) : null}

      {channelLeftNotice ? (
        <div className="app-toast error">
          <span>{channelLeftNotice}</span>
          <button onClick={dismissChannelLeftNotice} aria-label={t("app.dismiss")}>×</button>
        </div>
      ) : null}

      {miningToast ? <div className="app-toast success">{miningToast}</div> : null}

      <main className="page-container">
        <div className="page-scroll" ref={scrollRef}>
          {page === "home" && (
            <Home
              streak={streak}
              mining={mining}
              miningBusy={miningBusy}
              onMining={handleMining}
              onRedeemGiftCode={handleRedeemGiftCode}
            />
          )}

          {page === "tasks" && <Tasks onRewardCoins={handleTaskReward} />}
          {page === "referrals" && (
            <Referrals
              telegramId={telegramId}
              referralsCount={referralsCount}
              referralRewardUsdt={referralRewardUsdt}
              referralRequiredTasks={referralRequiredTasks}
            />
          )}

          {page === "profile" && (
            <Profile
              lifetimeCoins={lifetimeCoins}
              lifetimeSpent={wallet.spent}
              usdtBalance={wallet.usdt}
              activities={activities}
              serverWalletAddress={wallet.walletAddress}
              withdrawalHistory={withdrawalHistory}
              onOpenExchange={() => setExchangeOpen(true)}
              onOpenWithdraw={() => {
                setResumeWithdrawalAfterChannel(true);
                setWithdrawalChannelOpen(true);
              }}
              onWalletConnected={handleWalletConnected}
              onWalletDisconnected={handleWalletDisconnected}
            />
          )}
        </div>
      </main>

      <BottomNav page={page} setPage={setPage} />

      <ExchangeModal
        open={exchangeOpen}
        coins={wallet.coins}
        onClose={() => setExchangeOpen(false)}
        onConfirm={handleExchange}
      />

      <WithdrawalChannelModal
        open={withdrawalChannelOpen}
        showContinue={resumeWithdrawalAfterChannel}
        onClose={() => {
          setWithdrawalChannelOpen(false);
          setResumeWithdrawalAfterChannel(false);
        }}
        onContinue={() => {
          setWithdrawalChannelOpen(false);
          if (resumeWithdrawalAfterChannel) {
            setWithdrawOpen(true);
            setResumeWithdrawalAfterChannel(false);
          }
        }}
      />

      <WithdrawalModal
        open={withdrawOpen}
        usdtBalance={wallet.usdt}
        walletAddress={wallet.walletAddress}
        onClose={() => setWithdrawOpen(false)}
        onConfirm={handleWithdraw}
      />    </div>
  );
}

