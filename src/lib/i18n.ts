import { useSyncExternalStore } from "react";
import { ru } from "./i18n-ru";
import { hi } from "./i18n-hi";

export type Lang = "ar" | "en" | "ru" | "hi";

/** Languages offered in the first-run picker and in Profile. `glyph` is a native-script letter used as the badge. */
export const LANGS: { code: Lang; native: string; english: string; glyph: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", native: "العربية", english: "Arabic", glyph: "ع", dir: "rtl" },
  { code: "en", native: "English", english: "English", glyph: "A", dir: "ltr" },
  { code: "ru", native: "Русский", english: "Russian", glyph: "Я", dir: "ltr" },
  { code: "hi", native: "हिन्दी", english: "Hindi", glyph: "अ", dir: "ltr" },
];
const LANG_CODES = LANGS.map((l) => l.code);
const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANG_CODES as string[]).includes(v);

const dict = {
  en: {
    home: "Home", games: "Games", wallet: "Wallet", exchange: "Exchange", referrals: "Referrals", recentGames: "Recent games", gamesSubtitle: "Find a game that fits your pace. All results are settled by ODDXS.", walletIntro: "Your balance and withdrawal requests.", walletActivity: "Wallet activity", noWalletActivity: "No wallet activity yet.", emptyTasksHint: "New tasks are added often — check back soon.",
    refKicker: "Invite & earn", wkKicker: "Direct payouts", unlockProgress: "Withdrawal unlock", payoutRules: "Payout rules", refNeeds: "Your friend must complete", pointsBal: "Points",
    balance: "Balance", points: "pts", pointsFull: "Points",
    watchAd: "Watch an ad for points", adLoading: "Loading ad…",     day: "day", days: "days",
                games: "Games", minBet: "Min", rtp: "RTP",
    crash: "Crash", crashDesc: "Cash out before the rocket drops",
    mines: "Mines", minesDesc: "Find the gems. Avoid the bombs.",
    dice: "Dice", diceDesc: "Set your chance, then roll",
    blackjack: "Blackjack", blackjackDesc: "Beat the dealer to 21",
    goldrush: "Gold Rush Mines", goldrushDesc: "Gold or mine? Dig deeper, up to 25x",
    back: "Back", stake: "Stake", bet: "Bet", betNext: "Bet next round", queued: "Queued for next round", cancel: "Cancel",
    cashOut: "Cash out", autoCash: "Auto cash-out", off: "Off",
    nextRound: "Next round in", running: "Flying…", crashed: "Crashed",
    youWon: "You won", youLost: "You lost", cashedAt: "Cashed out at",
    notEnough: "Not enough points", minBetMsg: "Minimum bet is 5 points",
    watchToPlay: "Watch an ad to earn points", needPoints: "You need points to play",
    start: "Start game", mineCount: "Mines", gems: "Gems", next: "Next",
    over: "Over", under: "Under", roll: "Roll", winChance: "Win chance", multiplier: "Multiplier", payout: "Payout", rollOver: "Roll over", rollUnder: "Roll under", rollingNow: "Rolling…", lastResult: "Last roll", diceTargetUnder: "Win if the roll is below", diceTargetOver: "Win if the roll is above",
    deal: "Deal", hit: "Hit", stand: "Stand", dealer: "Dealer", you: "You",
    bj: "Blackjack!", bust: "Bust", push: "Push", win: "Win", lose: "Lose",
    bjRules: "Blackjack pays 6:5 · Dealer stands on 17 · Ties go to the dealer",
    exchangeTitle: "Convert points to USDT", exchangeIntro: "Move points into your ODDXS USDT balance.", usdtBalance: "USDT balance", exchangeRate: "Conversion rate", exchangeAmount: "Points to convert", exchangeReceive: "You will receive", exchangeMin: "Minimum", exchangeMax: "Maximum", exchangeNow: "Convert now", exchangeConfirm: "Confirm conversion", exchangeSuccess: "Conversion completed", exchangeHistory: "Recent conversions", noExchanges: "No conversions yet", exchangeDisabled: "Exchange is temporarily unavailable", exchangeDisclaimer: "USDT is credited to your in-app balance. It is not sent to an external wallet automatically.",
    withdraw: "Withdraw", withdrawLocked: "Withdrawal unlocks at", withdrawMore: "more points to unlock withdrawal",
    withdrawAmount: "Amount (points)", withdrawAddr: "Wallet address", withdrawAddrPh: "Your payout wallet address",
    submit: "Submit request", submitting: "Sending your request…", requestSent: "Request sent — status: pending review",
    status_pending: "Pending", status_paid: "Paid", status_rejected: "Rejected",
    requests: "Your withdrawal requests", noRequests: "No requests yet",
    rate: "100 pts = $0.05", minWithdraw: "Min withdrawal 200 pts = $0.10", maxWithdrawLbl: "Max withdrawal",
    demo: "DEMO", demoNote: "Demo mode: no server is connected, so withdrawals are only recorded on this device and are NOT paid.",
    welcome: "Welcome bonus", language: "Language",
    profile: "Profile", profileKicker: "ACCOUNT", profileIntro: "Your info and settings.", connectedPlayer: "Telegram connected", adsWatched: "Ads watched", total: "Total", friends: "Friends", withdrawals: "Requests", preferences: "Preferences", soundDescription: "Optional game sound effects", languageDescription: "Choose the app language",
    entryWelcome: "Welcome to ODDXS", lobbySubtitle: "Choose a game.", openTelegram: "Open in Telegram", secureTelegram: "Open in Telegram", optionalSetting: "Optional", playNow: "PLAY", originalGameLabel: "ODDXS GAME", allGames: "All games", originalGames: "Originals", cardGames: "Card games", skillGames: "Skill games", availableGames: "available", emptyGames: "No games in this category yet.", entryTitle: "Can’t open ODDXS", entryLoading: "Loading your account…", entryKicker: "ODDXS", premiumKicker: "FREE PLAY", freePlayLabel: "FREE", liftOff: "READY FOR", liftOffAccent: "LIFT OFF?",
    free: "Free to play",
    adOverlayTitle: "Sponsored", adOverlayWait: "Reward in", adOverlayDone: "Claim reward", adOverlayClose: "Close",
    ok: "OK",
    howTo: "How to play", gotIt: "Got it", mute: "Sound",
    launching: "Launching…", liftoff: "LIFT OFF!", playAgain: "Bet again", cashed: "Cashed out", autoLine: "Auto cash-out line",
    methodGram: "Gram", methodBinance: "Binance ID", gramAddr: "Gram wallet address", binanceId: "Binance ID (Pay ID)",
    gramAddrPh: "UQ… / EQ… wallet address", binanceIdPh: "e.g. 123456789",
    adsNeeded: "Watch more ads to unlock withdrawal", adsProgress: "Ads watched for withdrawal", watchAdBtn: "Watch ad",
    amountPts: "Amount (points)", youGet: "You get", pendingNote: "Requests are reviewed by an admin and paid manually.",
    needLogin: "Open ODDXS from inside Telegram.", loading: "Loading…", retry: "Retry",
    refLink: "Invite friends", copyLink: "Copy invite link", copied: "Copied",
    referralsTitle: "Invite friends", referralsIntro: "Share your link. When a friend completes the requirements, you get the reward.", referralsCount: "Your referrals", referralReward: "Reward per referral", referralTasks: "Tasks required", referralAds: "Ads required", referralInvite: "Your invite link", referralCopy: "Copy link", referralShare: "Share on Telegram", referralSteps: "How it works", referralStepOne: "Send your link", referralStepTwo: "Your friend joins and completes the requirements", referralStepThree: "Your reward is added", referralUnavailable: "Referral link is not available yet.", referralCopied: "Link copied", referralRule: "Reward is added after the required tasks and ads are completed.", referralQualified: "Qualified referrals", loadingHint: "Connecting to your account…", gameOpenError: "Could not open this game.", gameBack: "Back to games",
    nextCommitLbl: "Next round seed hash", multiplierLbl: "Multiplier",
    err_exchange_disabled: "Exchange is temporarily unavailable.", err_exchange_min: "Below the minimum exchange amount.", err_exchange_max: "Above the maximum exchange amount.",
    err_insufficient: "Not enough points.", err_min_bet: "Bet is below the minimum.", err_max_bet: "Bet is above the maximum.",
    err_cooldown: "Please wait before the next ad.", err_daily_cap: "Daily ad limit reached. Come back tomorrow.", err_banned: "This account is blocked.",
    err_maintenance: "ODDXS is under maintenance. Try again soon.", err_round_open: "Finish your current round first.", err_game_disabled: "This game is temporarily off.",
    err_too_fast: "The ad was not watched long enough.", err_bad_pulse: "Ad session expired. Try again.", err_expired: "Ad session expired. Try again.",
    err_bad_gram_address: "That Gram address is not valid.", err_bad_binance_id: "Binance ID must be 6–15 digits.", err_bad_amount: "Enter a whole number of points.",
    err_withdraw_min: "Below the minimum withdrawal.", err_withdraw_max: "Above the maximum withdrawal.", err_need_ads: "Watch more ads first.", err_need_exchange_ad: "Watch an ad first to exchange.", err_ads_complete: "You already watched all required ads.", err_insufficient_usdt: "Not enough USDT balance. Exchange your points first.", withdrawNeedUsdt: "Exchange your points to USDT first, then withdraw.", amountUsdt: "Amount (USDT)", usdtBalLbl: "USDT balance", exchangeAdNote: "One short ad is required before each exchange.", exchangeWatchAd: "Watch ad & exchange", withdrawWatchAd: "Watch ad",
    err_pending_exists: "You already have a pending request.", err_withdraw_cooldown: "You withdrew recently. Try later.", err_method_disabled: "This method is disabled.",
    err_open_in_telegram: "Open ODDXS inside Telegram.", err_not_started: "Wait for the countdown.", err_slow_down: "Slow down a little.", err_no_ads: "Wait 5 seconds, then watch an ad.",
    launch: "Launch", readyToLaunch: "Ready", crashedAt: "Crashed at", lastCrashes: "Recent rounds", flightNote: "The crash point is set before each round starts.",
    payoutMethod: "Payout method", minWithdrawLbl: "Min withdrawal", txRef: "Payment reference", adminNote: "Note", invited: "Friends invited",
    tapReveal: "Tap tiles to find gems", restored: "Round restored", seedHashShort: "Seed hash", autoPh: "e.g. 2.00",
    loadErr: "Could not load ODDXS.", unlockIn: "Unlocks in", cashedWin: "Cashed out", youKept: "You kept",
    err_network: "No connection. Check your internet.", err_timeout: "The server took too long to respond. Try again.", err_server_error: "Server error. Try again.", err_round_closed: "That round is already finished.", err_not_found: "Round not found.",
    err_bad_cell: "Invalid tile.", err_no_picks: "Reveal at least one tile first.", err_bad_mines: "Invalid mine count.", err_bad_params: "Invalid settings.", err_bad_action: "Invalid action.",
    err_withdraw_cooldown_h: "Try again later.", err_user_not_found: "Account not found.", err_registration_closed: "Registration is closed.",
    forceNeed: "Required channels", forceChecking: "Checking your membership…", forceJoinFirst: "Join every channel, then come back and tap Verify.", joined: "Joined",
    forceTitle: "Join to continue", forceHint: "Join the channels below, then tap Verify.", join: "Join", verify: "Verify", stillMissing: "You have not joined all channels yet.", err_force_sub: "Join the required channels first.",
    tasks: "Tasks", tasksHint: "Finish tasks to get points.", watchEarn: "Watch Ad & Earn", promoTitle: "Quick task", promoSubtitle: "Open the task and complete it to earn points", promoClose: "Close", adWatchMore: "Watch the ad for at least", adStep1: "Tap the ad to open it", adStep2: "Stay on it for 2.5 seconds", adStep3: "Come back to the app", adReqTitle: "The remaining ads need a tap", adSupportTitle: "Support us 💙", adSupportBody: "You only need to watch the ad for 7 seconds. If you like, tap the ad to support us so we can make more offers — it’s totally optional and doesn’t affect your reward.", adSupportStart: "Watch the ad", adReqBody: "The first 10 ads are free. From now on every ad must be tapped, and tapping it takes you out of the bot. Tap the ad, then come back to get credit.", adReqStart: "Got it, start", adHomeClickHint: "Every ad now needs a tap that takes you out of the bot.", adFailNoClickTitle: "You didn’t tap the ad", adFailNoClickBody: "The ad was closed or ended without a tap, so it was not counted. Tap the ad itself, stay 2.5 seconds, then come back.", adFailShortTitle: "You came back too fast", adFailShortBody: "You tapped the ad but returned before 2.5 seconds. Stay on the ad a bit longer, then come back.", adRetry: "Try again", adClose: "Close", adClickHint: "You must tap the ad and stay on it for 2.5 seconds, then come back.", adStayAway: "Tap the ad to open it, then stay on it for at least", adNeedClick: "Tap the ad first", adVerifying: "Verifying…", adCapReached: "Today’s ads completed", adWatchHint: "Watch an ad for", adTaskGroup: "Ad task", adTaskUnavailable: "No ads available right now. Try again later.", adOpen: "Open", noTasks: "No tasks right now", go: "Go", claim: "Claim", verifying: "Checking…", taskDone: "Done", taskReward: "Task reward", waitSec: "Wait",
    refRule: "You earn {pts} pts for every friend who completes {tasks} task(s){ads}.", refTasksProgress: "Your tasks done", refAdsPart: " and watches {n} ads",
    err_task_wait: "Open the link and wait a few seconds first.", err_task_done: "You already completed this task.", err_task_full: "This task is full.", err_not_member: "Join the channel first, then tap Claim.", err_task_not_found: "Task not found.", err_verify_failed: "Could not verify right now. Try again later.",
    err_database_update_required: "The ODDXS database is missing required updates. Run the SQL update from the V6 package in Supabase.", err_api_unavailable: "The ODDXS API is not responding. Check that the Node server is deployed and /api routes reach it.", err_generic: "Something went wrong. Try again.",
 quickGames: "Quick Games", trending: "Trending Games", lbPoints: "Top players", lbReferrals: "Top inviters", lbEmpty: "No ranking yet — be the first!", lbYou: "You", lbHint: "Ranked by points", lbHintRef: "Ranked by referrals", lbInvites: "invites", popularGames: "Popular Games", viewAll: "View all", liveLabel: "Live", welcomeTo: "Welcome to", tagline: "Play. Win. Repeat.", startPlaying: "Start Playing", badgePopular: "Popular", badgeHot: "Hot", recentBets: "Recent Bets", watchNow: "Watch now", inviteEarn: "Invite friends, earn points", allGamesChip: "All Games", betsEmpty: "No bets yet.", resWon: "Won", resLost: "Lost", earnBtn: "Earn", cashoutAt: "Cash out at", betAmount: "Bet amount", tryLuck: "Try your luck", provider: "ODDXS Originals",
 tagCrash: "Catch the multiplier", tagMines: "Find the gems", tagDice: "Roll & win", tagBlackjack: "Beat the dealer",
  },
  ar: {
    home: "الرئيسية", wallet: "المحفظة", exchange: "تحويل USDT", referrals: "الإحالات", walletIntro: "رصيدك وطلبات السحب.", walletActivity: "نشاط المحفظة", noWalletActivity: "ماكو نشاط بالمحفظة لحد الآن.", emptyTasksHint: "نضيف مهام جديدة باستمرار، ارجع بعد شوي.",
    refKicker: "ادعُ واربح", wkKicker: "سحوبات مباشرة", unlockProgress: "فتح السحب", payoutRules: "شروط السحب", refNeeds: "لازم صديقك يكمّل", pointsBal: "النقاط",
    balance: "الرصيد", points: "نقطة", pointsFull: "النقاط",
    watchAd: "شوف إعلان وخذ نقاط", adLoading: "جاري فتح الإعلان…",     day: "يوم", days: "أيام",
                games: "الألعاب", minBet: "أقل رهان", rtp: "RTP",
    crash: "كراش", crashDesc: "اسحب قبل ما يطيح المضاعف",
    mines: "ماينز", minesDesc: "لقّط الجواهر وابتعد عن القنابل",
    dice: "نرد", diceDesc: "حدد فرصتك وارمِ",
    blackjack: "بلاك جاك", blackjackDesc: "وصل لـ21 قبل الموزّع",
    goldrush: "غولد راش ماينز", goldrushDesc: "ذهب أو لغم؟ احفر أعمق لين 25x",
    back: "رجوع", stake: "الرهان", bet: "راهن", betNext: "راهن للجولة القادمة", queued: "مسجّل للجولة القادمة", cancel: "إلغاء",
    cashOut: "سحب", autoCash: "سحب تلقائي", off: "إيقاف",
    nextRound: "الجولة القادمة بعد", running: "يطير…", crashed: "انهار",
    youWon: "ربحت", youLost: "خسرت", cashedAt: "سحبت عند",
    notEnough: "رصيدك غير كافٍ", minBetMsg: "أقل رهان 5 نقاط",
    watchToPlay: "شاهد إعلان لتجمع نقاط", needPoints: "تحتاج نقاط لتلعب",
    start: "ابدأ اللعبة", mineCount: "القنابل", gems: "الألماس", next: "التالي",
    over: "أعلى", under: "أقل", roll: "ارمِ", winChance: "فرصة الفوز", multiplier: "المضاعف", payout: "الربح", rollOver: "أعلى من", rollUnder: "أقل من", rollingNow: "جاري الرمي…", lastResult: "آخر رمية", diceTargetUnder: "تفوز إذا طلع الرقم أقل من", diceTargetOver: "تفوز إذا طلع الرقم أعلى من",
    deal: "وزّع", hit: "سحب ورقة", stand: "ثبّت", dealer: "الموزّع", you: "أنت",
    bj: "بلاك جاك!", bust: "تجاوزت 21", push: "تعادل", win: "فوز", lose: "خسارة",
    bjRules: "البلاك جاك يدفع 6:5 · الموزّع يثبت عند 17 · التعادل لصالح الموزّع",
    exchangeTitle: "حوّل نقاطك إلى USDT", exchangeIntro: "حوّل نقاطك إلى رصيد USDT داخل ODDXS.", usdtBalance: "رصيد USDT", exchangeRate: "سعر التحويل", exchangeAmount: "النقاط المراد تحويلها", exchangeReceive: "ستحصل على", exchangeMin: "الحد الأدنى", exchangeMax: "الحد الأقصى", exchangeNow: "حوّل الآن", exchangeConfirm: "تأكيد التحويل", exchangeSuccess: "تم التحويل بنجاح", exchangeHistory: "آخر التحويلات", noExchanges: "لا توجد تحويلات بعد", exchangeDisabled: "التحويل متوقف مؤقتاً", exchangeDisclaimer: "يُضاف USDT إلى رصيدك داخل التطبيق، ولا يُرسل تلقائياً إلى محفظة خارجية.",
    withdraw: "سحب", withdrawLocked: "السحب يفتح عند", withdrawMore: "نقطة إضافية لفتح السحب",
    withdrawAmount: "المبلغ (نقاط)", withdrawAddr: "عنوان المحفظة", withdrawAddrPh: "عنوان محفظة الاستلام",
    submit: "إرسال الطلب", submitting: "جاري إرسال طلبك…", requestSent: "تم إرسال الطلب — الحالة: قيد المراجعة",
    status_pending: "قيد المراجعة", status_paid: "تم الدفع", status_rejected: "مرفوض",
    requests: "طلبات السحب", noRequests: "لا توجد طلبات",
    rate: "100 نقطة = 0.05$", minWithdraw: "أقل سحب 200 نقطة = 0.10$", maxWithdrawLbl: "أعلى سحب",
    demo: "تجريبي", demoNote: "وضع تجريبي: لا يوجد سيرفر متصل، لذلك طلبات السحب تُسجَّل على جهازك فقط ولا يتم دفعها.",
    welcome: "مكافأة الترحيب", language: "اللغة",
    profile: "حسابي", profileKicker: "حسابي", profileIntro: "بياناتك وإعداداتك.", connectedPlayer: "تلغرام متصل", adsWatched: "الإعلانات المشاهدة", total: "الإجمالي", friends: "الأصدقاء", withdrawals: "الطلبات", preferences: "التفضيلات", soundDescription: "مؤثرات صوتية اختيارية للألعاب", languageDescription: "اختر لغة التطبيق",
    entryWelcome: "هلا بيك", lobbySubtitle: "اختار لعبتك.", openTelegram: "افتح عبر تيليجرام", secureTelegram: "افتحه من تلغرام", optionalSetting: "اختياري", playNow: "العب", originalGameLabel: "لعبة ODDXS", allGames: "كل الألعاب", originalGames: "ألعاب أصلية", cardGames: "ألعاب الورق", skillGames: "ألعاب المهارة", availableGames: "متاحة", emptyGames: "لا توجد ألعاب في هذا التصنيف حالياً.", entryTitle: "ما قدرنا نفتح ODDXS", entryLoading: "جاري تحميل حسابك…", entryKicker: "ODDXS", premiumKicker: "اللعب مجاني", freePlayLabel: "مجاني", liftOff: "هل أنت جاهز", liftOffAccent: "للإقلاع؟",
    free: "اللعب مجاني",
    adOverlayTitle: "إعلان", adOverlayWait: "المكافأة بعد", adOverlayDone: "استلم المكافأة", adOverlayClose: "إغلاق",
    ok: "حسناً",
    howTo: "طريقة اللعب", gotIt: "فهمت", mute: "الصوت",
    launching: "جاري الإطلاق…", liftoff: "انطلق!", playAgain: "راهن مجدداً", cashed: "تم السحب", autoLine: "خط السحب التلقائي",
    methodGram: "Gram", methodBinance: "Binance ID", gramAddr: "عنوان محفظة Gram", binanceId: "Binance ID (Pay ID)",
    gramAddrPh: "عنوان UQ… / EQ…", binanceIdPh: "مثال 123456789",
    adsNeeded: "شاهد إعلانات إضافية لفتح السحب", adsProgress: "إعلانات السحب", watchAdBtn: "شاهد إعلان",
    amountPts: "المبلغ (نقاط)", youGet: "ستحصل على", pendingNote: "الطلبات تُراجع من الأدمن وتُدفع يدوياً.",
    needLogin: "افتح ODDXS من داخل تلغرام.", loading: "جاري التحميل…", retry: "إعادة المحاولة",
    refLink: "ادعُ أصدقاءك", copyLink: "انسخ رابط الدعوة", copied: "تم النسخ",
    referralsTitle: "ادعُ أصدقاءك وخذ نقاط", referralsIntro: "أرسل رابطك لصديقك، وإذا كمّل المطلوب تنضاف مكافأتك.", referralsCount: "إحالاتك", referralReward: "مكافأة كل إحالة", referralTasks: "المهام المطلوبة", referralAds: "الإعلانات المطلوبة", referralInvite: "رابط دعوتك", referralCopy: "نسخ الرابط", referralShare: "شارك على تلغرام", referralSteps: "شلون تشتغل؟", referralStepOne: "أرسل رابطك لصديقك", referralStepTwo: "يدخل ويكمّل المطلوب", referralStepThree: "تنضاف لك المكافأة", referralUnavailable: "رابط الدعوة غير متوفر حالياً.", referralCopied: "نسخت الرابط", referralRule: "تنضاف المكافأة بعد ما صديقك يكمّل المهام والإعلانات المطلوبة.", referralQualified: "الإحالات المكتملة", loadingHint: "نتصل بحسابك…", gameOpenError: "ما قدرنا نفتح اللعبة.", gameBack: "رجوع للألعاب",
    nextCommitLbl: "بصمة بذرة الجولة القادمة", multiplierLbl: "المضاعف",
    err_exchange_disabled: "التحويل متوقف مؤقتاً.", err_exchange_min: "المبلغ أقل من الحد الأدنى للتحويل.", err_exchange_max: "المبلغ أعلى من الحد الأقصى للتحويل.",
    err_insufficient: "رصيدك غير كافٍ.", err_min_bet: "الرهان أقل من الحد الأدنى.", err_max_bet: "الرهان أعلى من الحد الأقصى.",
    err_cooldown: "انتظر قليلاً قبل الإعلان التالي.", err_daily_cap: "وصلت للحد اليومي للإعلانات. ارجع غداً.", err_banned: "هذا الحساب محظور.",
    err_maintenance: "ODDXS تحت الصيانة. حاول بعد قليل.", err_round_open: "أنهِ جولتك الحالية أولاً.", err_game_disabled: "هذه اللعبة متوقفة مؤقتاً.",
    err_too_fast: "لم تُشاهد الإعلان لمدة كافية.", err_bad_pulse: "انتهت جلسة الإعلان. حاول مجدداً.", err_expired: "انتهت جلسة الإعلان. حاول مجدداً.",
    err_bad_gram_address: "عنوان Gram غير صالح.", err_bad_binance_id: "Binance ID يجب أن يكون 6–15 رقماً.", err_bad_amount: "أدخل عدداً صحيحاً من النقاط.",
    err_withdraw_min: "أقل من الحد الأدنى للسحب.", err_withdraw_max: "أعلى من الحد الأقصى للسحب.", err_need_ads: "شاهد إعلانات أكثر أولاً.", err_need_exchange_ad: "شاهد إعلان أولاً لإتمام التحويل.", err_ads_complete: "أكملت كل الإعلانات المطلوبة.", err_insufficient_usdt: "رصيد USDT غير كافٍ. حوّل نقاطك إلى USDT أولاً.", withdrawNeedUsdt: "حوّل نقاطك إلى USDT أولاً ثم اسحب.", amountUsdt: "المبلغ (USDT)", usdtBalLbl: "رصيد USDT", exchangeAdNote: "يلزم مشاهدة إعلان قصير قبل كل تحويل.", exchangeWatchAd: "شاهد إعلان وحوّل", withdrawWatchAd: "شاهد إعلان",
    err_pending_exists: "لديك طلب سحب قيد المراجعة.", err_withdraw_cooldown: "سحبت مؤخراً. حاول لاحقاً.", err_method_disabled: "هذه الطريقة متوقفة.",
    err_open_in_telegram: "افتح ODDXS من داخل تلغرام.", err_not_started: "انتظر العد التنازلي.", err_slow_down: "على مهلك قليلاً.", err_no_ads: "انتظر 5 ثواني وشاهد إعلان.",
    launch: "انطلق", readyToLaunch: "جاهز", crashedAt: "انهار عند", lastCrashes: "آخر الجولات", flightNote: "نقطة الانهيار تتحدد قبل كل جولة.",
    payoutMethod: "طريقة الاستلام", minWithdrawLbl: "أقل سحب", txRef: "مرجع الدفع", adminNote: "ملاحظة", invited: "الأصدقاء المدعوون",
    tapReveal: "اضغط المربعات لتجد الألماس", restored: "تمت استعادة جولتك", seedHashShort: "بصمة البذرة", autoPh: "مثال 2.00",
    loadErr: "تعذّر تحميل ODDXS.", unlockIn: "يفتح بعد", cashedWin: "تم السحب", youKept: "احتفظت بـ",
    err_network: "ماكو اتصال. تأكد من الإنترنت.", err_timeout: "السيرفر تأخر بالرد. جرّب مرة ثانية.", err_server_error: "خطأ في السيرفر. حاول مجدداً.", err_round_closed: "هذه الجولة انتهت.", err_not_found: "الجولة غير موجودة.",
    err_bad_cell: "مربع غير صالح.", err_no_picks: "اكشف مربعاً واحداً على الأقل أولاً.", err_bad_mines: "عدد قنابل غير صالح.", err_bad_params: "إعدادات غير صالحة.", err_bad_action: "إجراء غير صالح.",
    err_withdraw_cooldown_h: "حاول لاحقاً.", err_user_not_found: "الحساب غير موجود.", err_registration_closed: "التسجيل مغلق.",
    forceNeed: "القنوات المطلوبة", forceChecking: "جاري التحقق من اشتراكك…", forceJoinFirst: "اشترك بكل القنوات ثم ارجع واضغط تحقق.", joined: "تم الاشتراك",
    forceTitle: "اشترك للمتابعة", forceHint: "اشترك في القنوات التالية ثم اضغط تحقق.", join: "اشترك", verify: "تحقق", stillMissing: "لم تشترك في كل القنوات بعد.", err_force_sub: "اشترك في القنوات المطلوبة أولاً.",
    tasks: "المهام", tasksHint: "كمّل المهام وخذ نقاط.", watchEarn: "شاهد الإعلان واربح", promoTitle: "مهمة سريعة", promoSubtitle: "افتح المهمة وأنجزها لتربح نقاط", promoClose: "إغلاق", adWatchMore: "شاهد الإعلان لمدة لا تقل عن", adStep1: "اضغط على الإعلان ليفتح", adStep2: "ابقَ فيه 2.5 ثانية", adStep3: "ارجع للتطبيق", adReqTitle: "الإعلانات المتبقية تحتاج ضغطة", adSupportTitle: "ادعمنا 💙", adSupportBody: "يكفي تشاهد الإعلان 7 ثواني فقط. وإذا حاب تدعمنا اضغط على الإعلان عشان نسوي عروض أكثر — الضغط اختياري تماماً وما يأثر على مكافأتك.", adSupportStart: "شاهد الإعلان", adReqBody: "أول 10 إعلانات بدون ضغط. من الآن كل إعلان لازم تضغط عليه، والضغطة تطلعك من البوت. اضغط على الإعلان ثم ارجع للبوت عشان ينحسب.", adReqStart: "فهمت، ابدأ", adHomeClickHint: "كل إعلان الآن يحتاج ضغطة تطلعك من البوت.", adFailNoClickTitle: "ما ضغطت على الإعلان", adFailNoClickBody: "الإعلان انسكر أو انتهى بدون ضغط عليه، فما انحسبت المشاهدة. اضغط على الإعلان نفسه، وابقَ فيه 2.5 ثانية، ثم ارجع.", adFailShortTitle: "رجعت بسرعة", adFailShortBody: "ضغطت على الإعلان لكن رجعت قبل 2.5 ثانية. ابقَ في الإعلان مدة أطول ثم ارجع.", adRetry: "حاول مرة ثانية", adClose: "إغلاق", adClickHint: "لازم تضغط على الإعلان وتبقى فيه 2.5 ثانية ثم ترجع.", adStayAway: "اضغط على الإعلان وابقَ فيه مدة لا تقل عن", adNeedClick: "اضغط على الإعلان أولاً ثم انتظر", adVerifying: "جاري التحقق…", adCapReached: "اكتملت إعلانات اليوم", adWatchHint: "شاهد إعلان لمدة", adTaskGroup: "مهمة إعلانية", adTaskUnavailable: "ماكو إعلانات متاحة حالياً. جرّب بعدين.", adOpen: "افتح", noTasks: "لا توجد مهام حالياً", go: "ابدأ", claim: "استلم", verifying: "جارٍ التحقق…", taskDone: "مكتملة", taskReward: "مكافأة المهمة", waitSec: "انتظر",
    refRule: "تربح {pts} نقطة عن كل صديق ينجز {tasks} مهمة{ads}.", refTasksProgress: "مهامك المنجزة", refAdsPart: " ويشاهد {n} إعلان",
    err_task_wait: "افتح الرابط وانتظر بضع ثوانٍ أولاً.", err_task_done: "أنجزت هذه المهمة من قبل.", err_task_full: "اكتمل عدد المنجزين لهذه المهمة.", err_not_member: "اشترك في القناة أولاً ثم اضغط استلم.", err_task_not_found: "المهمة غير موجودة.", err_verify_failed: "تعذّر التحقق الآن. حاول لاحقاً.",
    err_database_update_required: "قاعدة بيانات ODDXS ينقصها تحديث. نفّذ تحديث SQL الموجود في نسخة V6 من Supabase.", err_api_unavailable: "سيرفر ODDXS لا يستجيب بشكل صحيح. تأكد أن سيرفر Node منشور وأن مسارات /api متصلة به.", err_generic: "حدث خطأ. حاول مجدداً.",
 quickGames: "ألعاب سريعة", trending: "الأكثر لعباً", lbPoints: "أكثر اللاعبين نقاطاً", lbReferrals: "أكثر المدعوين", lbEmpty: "ما في ترتيب بعد — كن أول واحد!", lbYou: "أنت", lbHint: "الترتيب حسب النقاط", lbHintRef: "الترتيب حسب الإحالات", lbInvites: "دعوة", popularGames: "الألعاب الشائعة", viewAll: "عرض الكل", liveLabel: "مباشر", welcomeTo: "أهلاً بك في", tagline: "العب. اربح. كرر.", startPlaying: "ابدأ اللعب", badgePopular: "شائع", badgeHot: "رائج", recentBets: "آخر الرهانات", watchNow: "شاهد الآن", inviteEarn: "ادعُ أصدقاءك واربح نقاط", allGamesChip: "كل الألعاب", betsEmpty: "ماكو رهانات لحد الآن.", resWon: "ربح", resLost: "خسارة", earnBtn: "اربح", cashoutAt: "اسحب عند", betAmount: "مبلغ الرهان", tryLuck: "جرّب حظك", provider: "ODDXS أوريجنال",
 tagCrash: "اسحب قبل الانهيار", tagMines: "لقّط الجواهر", tagDice: "ارمِ واربح", tagBlackjack: "اهزم الموزّع",
  },
} as const;

export type Key = keyof typeof dict.en;
export const errKey = (code: string): Key => (("err_" + code) in dict.en ? ("err_" + code) as Key : "err_generic");

// ru / hi fall back to English for any key they do not define.
const full: Record<Lang, Record<string, string>> = {
  en: dict.en as unknown as Record<string, string>,
  ar: dict.ar as unknown as Record<string, string>,
  ru: { ...(dict.en as unknown as Record<string, string>), ...ru },
  hi: { ...(dict.en as unknown as Record<string, string>), ...hi },
};

const LS_KEY = "oddxs.lang";
let lang: Lang = "en";
let chosen = false;       // the user has picked a language (first-run screen is done)
let pendingCloud = false; // waiting (briefly) for Telegram CloudStorage before deciding whether to show the picker
const subs = new Set<() => void>();
const tgWebApp = () => (window as any).Telegram?.WebApp;

try {
  const saved = localStorage.getItem(LS_KEY);
  if (isLang(saved)) { lang = saved; chosen = true; }
} catch { /* storage can be unavailable in WebViews */ }

if (!chosen) {
  // Pre-select the Telegram language so the picker highlights it; it does NOT count as chosen.
  try {
    const code = String(tgWebApp()?.initDataUnsafe?.user?.language_code || navigator.language || "en").toLowerCase().slice(0, 2);
    lang = isLang(code) ? code : "en";
  } catch { /* ignore */ }
  // Same Telegram account on another device / after a cache wipe: restore the saved choice from Telegram CloudStorage.
  try {
    const cs = tgWebApp()?.CloudStorage;
    if (cs?.getItem) {
      pendingCloud = true;
      const done = () => { if (pendingCloud) { pendingCloud = false; apply(); subs.forEach((f) => f()); } };
      const timer = window.setTimeout(done, 900);
      cs.getItem(LS_KEY, (err: unknown, value: string) => {
        window.clearTimeout(timer);
        if (!err && isLang(value) && !chosen) {
          lang = value; chosen = true;
          try { localStorage.setItem(LS_KEY, value); } catch { /* ignore */ }
        }
        done();
      });
    }
  } catch { pendingCloud = false; }
}

function apply() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}
apply();

export function setLang(l: Lang) {
  lang = l; chosen = true; pendingCloud = false;
  try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
  try { tgWebApp()?.CloudStorage?.setItem?.(LS_KEY, l, () => {}); } catch { /* ignore */ }
  apply();
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useLang(): Lang { return useSyncExternalStore(subscribe, () => lang); }
/** true once the user has picked a language (or it was restored from a previous session). */
export function useLangChosen(): boolean { return useSyncExternalStore(subscribe, () => chosen); }
/** true while we are still waiting for Telegram CloudStorage (only a few hundred ms at most). */
export function useLangPending(): boolean { return useSyncExternalStore(subscribe, () => pendingCloud); }
export function useT() {
  const l = useLang();
  return (k: Key) => full[l][k] as string;
}
/** Inline text for places that are not in the dictionary: tx(arabic, english, russian?, hindi?). Missing ru/hi fall back to English. */
export function useTx() {
  const l = useLang();
  return (ar: string, en: string, ruText?: string, hiText?: string) => (l === "ar" ? ar : l === "ru" ? ruText ?? en : l === "hi" ? hiText ?? en : en);
}
