// Stormy — تطبيق مبني على localStorage (بدون خادم بيانات)، بميزات أصلية:
// Daily Check-in بسلسلة 7 أيام، Challenge رد فعل مهارة حقيقية (لعبة البرق)،
// Quiz Dayي (كويز معلومات عامة)، مهمة Join لقناة، وإعلان Reward اختياري.

(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try { tg.ready(); tg.expand(); } catch (e) {}
  }

  var CHANNEL_URL =
    (window.CONFIG && window.CONFIG.CHANNEL_URL && window.CONFIG.CHANNEL_URL.indexOf("REPLACE_WITH") !== 0)
      ? window.CONFIG.CHANNEL_URL
      : "https://t.me/your_channel";

  var STORAGE_KEY = "stormy_state_v1";

  var todayKey = function () {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  };

  // رقم Day ثابت لكل تاريخ، يُستخدم لاختيار Quiz الكويز الDayي بشكل حتمي
  var dayNumber = function () {
    return Math.floor(Date.now() / 86400000);
  };

  var defaultState = function () {
    return {
      balance: 0,
      lastCheckin: null,
      streak: 0,
      taskJoined: false,
      taskClaimed: false,
      name: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || "Stormy Player",
      joinedAt: todayKey(),
      totalCheckins: 0,
      totalGames: 0,
      bestReaction: null, // أفضل متوسط رد فعل بالمللي ثانية (أقل = أفضل)
      lastGameDate: null,
      quizDate: null,
      quizAnswered: false,
      adsWatchedToday: 0,
      adsDate: todayKey(),
      history: [],
      withdrawalRequests: []
    };
  };

  var loadState = function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  };

  var state = loadState();

  var saveState = function () {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  // ---------- Toast ----------
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  var showToast = function (msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("toast--show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("toast--show");
    }, 2200);
  };

  // ---------- Navigation ----------
  var pages = document.querySelectorAll(".page");
  var navBtns = document.querySelectorAll(".nav-btn");

  var goToPage = function (name) {
    pages.forEach(function (p) {
      p.classList.toggle("page--active", p.id === "page-" + name);
    });
    navBtns.forEach(function (b) {
      b.classList.toggle("nav-btn--active", b.dataset.page === name);
    });
  };

  navBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      goToPage(btn.dataset.page);
    });
  });

  // ---------- Elements ----------
  var balanceValueEl = document.getElementById("balanceValue");
  var homeBalanceEl = document.getElementById("homeBalance");
  var profileBalanceEl = document.getElementById("profileBalance");
  var profileStreakEl = document.getElementById("profileStreak");
  var profileNameEl = document.getElementById("profileName");
  var streakBadgeEl = document.getElementById("streakBadge");
  var checkinDaysEl = document.getElementById("checkinDays");
  var checkinBtn = document.getElementById("checkinBtn");
  var taskJoinBtn = document.getElementById("taskJoinBtn");
  var taskClaimBtn = document.getElementById("taskClaimBtn");
  var watchAdBtn = document.getElementById("watchAdBtn");
  var adHintEl = document.getElementById("adHint");
  var statCheckinsEl = document.getElementById("statCheckins");
  var statGamesEl = document.getElementById("statGames");
  var statBestEl = document.getElementById("statBest");
  var activityListEl = document.getElementById("activityList");
  var topAvatarEl = document.getElementById("topAvatar");
  var topGreetEl = document.getElementById("topGreet");
  var levelChipEl = document.getElementById("levelChip");
  var levelNameEl = document.getElementById("levelName");
  var levelProgressBarEl = document.getElementById("levelProgressBar");
  var levelProgressTextEl = document.getElementById("levelProgressText");
  var profileLevelEl = document.getElementById("profileLevel");
  var profileSinceEl = document.getElementById("profileSince");

  // ---------- Withdrawals ----------
  var WITHDRAWAL_STEP = 500;
  var WITHDRAWAL_USDT_PER_STEP = 0.10;
  var WITHDRAWAL_RECORDS_V2 = [{"user": "@zinouzahrou", "amount": "0.1300", "method": "Binance ID", "wallet": "445661890"}, {"user": "@hazemragab123", "amount": "0.1072", "method": "Binance ID", "wallet": "430575084"}, {"user": "@Shahinaz10", "amount": "0.2000", "method": "Binance ID", "wallet": "1082527333"}, {"user": "@Hosweda", "amount": "0.1149", "method": "Binance ID", "wallet": "1097873110"}, {"user": "@NHDKNFD", "amount": "0.2000", "method": "GRAM Wallet (TON)", "wallet": "UQB8BWeXQ--euMbWZpbO7wnnttrcsiXRHRcxxr-4oLeB7ptA"}, {"user": "@Xe_Reda", "amount": "0.2000", "method": "GRAM Wallet (TON)", "wallet": "UQBdagXRjoXKp8RAOE6ce2Hshv-vFoB8hLz-lm7T9Y3Succm"}, {"user": "@lIlIlIIIlIlll", "amount": "0.2000", "method": "Binance ID", "wallet": "1065526460"}, {"user": "@Samirkeb", "amount": "0.1266", "method": "Binance ID", "wallet": "438593336"}, {"user": "@fvhvcd", "amount": "0.2000", "method": "GRAM Wallet (TON)", "wallet": "UQAT4KTLb-U-hxDDCIshxOnX-TXwOO11qxZa7CHdGV942JSV"}, {"user": "@mohammed11256", "amount": "0.1328", "method": "Binance ID", "wallet": "1078918898"}, {"user": "@jjajaic", "amount": "0.1000", "method": "GRAM Wallet (TON)", "wallet": "UQAtE2BB7t2xr10XaffLArGL5-nEXnU3q7_HBTzw_lQeiM-V"}, {"user": "@LLEEO22", "amount": "0.1000", "method": "Binance ID", "wallet": "793321075"}, {"user": "@lIlIlIIIlIlll", "amount": "0.2000", "method": "Binance ID", "wallet": "1065526460"}, {"user": "@jjajaic", "amount": "0.1000", "method": "GRAM Wallet (TON)", "wallet": "UQAtE2BB7t2xr10XaffLArGL5-nEXnU3q7_HBTzw_lQeiM-V"}, {"user": "@Shahinaz10", "amount": "0.1017", "method": "Binance ID", "wallet": "1082527333"}, {"user": "@jkmsow", "amount": "0.1030", "method": "GRAM Wallet (TON)", "wallet": "UQBFuXbCKflsITzhCiOmtOwY1u5KpsuQfaLLpsKRIJONMR4f"}, {"user": "@jjajaic", "amount": "0.2000", "method": "GRAM Wallet (TON)", "wallet": "UQAtE2BB7t2xr10XaffLArGL5-nEXnU3q7_HBTzw_lQeiM-V"}, {"user": "@Jdjdjdj838655", "amount": "0.2000", "method": "GRAM Wallet (TON)", "wallet": "UQBz_HsiHDZY94hutFEZdlVIAmjqLMPWPzacyoihAZdm_Jl5"}, {"user": "@jjajaic", "amount": "0.2000", "method": "GRAM Wallet (TON)", "wallet": "UQAtE2BB7t2xr10XaffLArGL5-nEXnU3q7_HBTzw_lQeiM-V"}, {"user": "Player #0954", "amount": "0.1000", "method": "Binance ID", "wallet": "1188271952"}, {"user": "@ov_ooo", "amount": "0.1000", "method": "Binance ID", "wallet": "972801667"}];
  var withdrawBalanceEl = document.getElementById("withdrawBalance");
  var withdrawOptionsEl = document.getElementById("withdrawOptions");
  var withdrawBtn = document.getElementById("withdrawBtn");
  var withdrawHintEl = document.getElementById("withdrawHint");
  var withdrawWalletEl = document.getElementById("withdrawWallet");
  var lastWithdrawalEl = document.getElementById("lastWithdrawal");
  var withdrawalHistoryEl = document.getElementById("withdrawalHistory");
  var withdrawalCountEl = document.getElementById("withdrawalCount");
  var withdrawMethodButtons = document.querySelectorAll(".withdraw-method");
  var selectedWithdrawPoints = 0;
  var selectedWithdrawMethod = "GRAM Wallet (TON)";

  var maskWallet = function (value) {
    value = String(value || "");
    if (value.length <= 8) return value;
    return value.slice(0, 4) + "••••" + value.slice(-4);
  };

  var escapeHtml = function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  var renderWithdrawOptions = function () {
    if (!withdrawOptionsEl) return;
    var maxSteps = Math.floor(state.balance / WITHDRAWAL_STEP);
    if (maxSteps < 1) {
      selectedWithdrawPoints = 0;
      withdrawOptionsEl.innerHTML = '<div class="withdraw-empty">You need at least 500 Spark to withdraw.</div>';
      return;
    }
    if (!selectedWithdrawPoints || selectedWithdrawPoints > maxSteps * WITHDRAWAL_STEP) {
      selectedWithdrawPoints = WITHDRAWAL_STEP;
    }
    var html = "";
    for (var i = 1; i <= maxSteps; i++) {
      var points = i * WITHDRAWAL_STEP;
      var usdt = (i * WITHDRAWAL_USDT_PER_STEP).toFixed(2);
      html += '<button type="button" class="withdraw-option' + (points === selectedWithdrawPoints ? ' is-selected' : '') + '" data-points="' + points + '">' +
        '<span class="withdraw-option__points">' + points.toLocaleString("en-US") + ' ⚡</span>' +
        '<span class="withdraw-option__usdt">' + usdt + ' USDT</span>' +
        '</button>';
    }
    withdrawOptionsEl.innerHTML = html;
    withdrawOptionsEl.querySelectorAll(".withdraw-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedWithdrawPoints = Number(btn.dataset.points);
        renderWithdrawOptions();
        updateWithdrawButton();
      });
    });
  };

  var updateWithdrawButton = function () {
    if (!withdrawBtn || !withdrawWalletEl) return;
    var maxSteps = Math.floor(state.balance / WITHDRAWAL_STEP);
    var amount = (selectedWithdrawPoints / WITHDRAWAL_STEP * WITHDRAWAL_USDT_PER_STEP).toFixed(2);
    var valid = selectedWithdrawPoints >= WITHDRAWAL_STEP && selectedWithdrawPoints <= state.balance && maxSteps >= 1 && withdrawWalletEl.value.trim().length > 0;
    withdrawBtn.disabled = !valid;
    withdrawBtn.textContent = "Withdrawal " + amount + " USDT";
    if (state.balance < WITHDRAWAL_STEP) {
      withdrawHintEl.textContent = "Minimum withdrawal: 500 Spark = 0.10 USDT.";
    } else if (!withdrawWalletEl.value.trim()) {
      withdrawHintEl.textContent = "Enter your wallet address or Binance ID to complete the request.";
    } else {
      withdrawHintEl.textContent = selectedWithdrawMethod + " • The request will be recorded locally in this version.";
    }
  };

  var renderWithdrawalRecords = function () {
    if (!lastWithdrawalEl || !withdrawalHistoryEl) return;
    var latest = WITHDRAWAL_RECORDS_V2[WITHDRAWAL_RECORDS_V2.length - 1];
    lastWithdrawalEl.innerHTML =
      '<div class="withdraw-last-user">👤 ' + escapeHtml(latest.user) + '</div>' +
      '<div class="withdraw-last-amount">' + escapeHtml(latest.amount) + ' <span>USDT</span></div>' +
      '<div class="withdraw-last-meta"><span>📤 ' + escapeHtml(latest.method) + '</span><span>💳 ' + escapeHtml(maskWallet(latest.wallet)) + '</span></div>' +
      '<div class="withdraw-last-success">🚀 Payment has been sent successfully.</div>';

    withdrawalCountEl.textContent = WITHDRAWAL_RECORDS_V2.length;
    withdrawalHistoryEl.innerHTML = WITHDRAWAL_RECORDS_V2.slice().reverse().map(function (item) {
      return '<div class="withdrawal-item">' +
        '<div class="withdrawal-item__top"><b>' + escapeHtml(item.user) + '</b><strong>' + escapeHtml(item.amount) + ' USDT</strong></div>' +
        '<div class="withdrawal-item__meta"><span>' + escapeHtml(item.method) + '</span><span>' + escapeHtml(maskWallet(item.wallet)) + '</span></div>' +
        '<div class="withdrawal-item__success">✓ Payment sent successfully</div>' +
      '</div>';
    }).join("");
  };

  var renderWithdrawals = function () {
    if (!withdrawBalanceEl) return;
    withdrawBalanceEl.textContent = state.balance.toLocaleString("en-US");
    renderWithdrawOptions();
    updateWithdrawButton();
    renderWithdrawalRecords();
  };

  withdrawMethodButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      withdrawMethodButtons.forEach(function (b) { b.classList.remove("is-selected"); });
      btn.classList.add("is-selected");
      selectedWithdrawMethod = btn.dataset.method;
      withdrawWalletEl.placeholder = selectedWithdrawMethod === "Binance ID" ? "Enter Binance ID" : "Enter GRAM Wallet (TON) address";
      updateWithdrawButton();
    });
  });

  if (withdrawWalletEl) withdrawWalletEl.addEventListener("input", updateWithdrawButton);

  if (withdrawBtn) withdrawBtn.addEventListener("click", function () {
    if (withdrawBtn.disabled) return;
    var points = selectedWithdrawPoints;
    var amount = (points / WITHDRAWAL_STEP * WITHDRAWAL_USDT_PER_STEP).toFixed(2);
    var destination = withdrawWalletEl.value.trim();
    state.balance -= points;
    state.withdrawalRequests = state.withdrawalRequests || [];
    state.withdrawalRequests.unshift({
      points: points,
      amount: amount,
      method: selectedWithdrawMethod,
      destination: destination,
      status: "pending",
      date: todayKey()
    });
    state.history.unshift({ label: "طلب Withdrawal " + amount + " USDT", amount: -points, date: todayKey() });
    state.history = state.history.slice(0, 8);
    saveState();
    withdrawWalletEl.value = "";
    selectedWithdrawPoints = 0;
    showToast("Withdrawal request recorded locally 💸");
    render();
  });

  var addBalance = function (amount, label) {
    state.balance += amount;
    if (label) {
      state.history.unshift({ label: label, amount: amount, date: todayKey() });
      state.history = state.history.slice(0, 8);
    }
    saveState();
  };

  var LEVELS = [
    { name: "Rising Storm", icon: "🌩️", min: 0 },
    { name: "Storm", icon: "⛈️", min: 200 },
    { name: "Major Storm", icon: "🌪️", min: 600 },
    { name: "Stormy Hurricane", icon: "⚡", min: 1500 }
  ];

  var getLevelInfo = function () {
    var current = LEVELS[0];
    var next = LEVELS[1];
    for (var i = 0; i < LEVELS.length; i++) {
      if (state.balance >= LEVELS[i].min) {
        current = LEVELS[i];
        next = LEVELS[i + 1] || null;
      }
    }
    return { current: current, next: next };
  };

  var renderLevel = function () {
    var info = getLevelInfo();
    levelChipEl.querySelector(".level-chip__icon").textContent = info.current.icon;
    levelNameEl.textContent = info.current.name;
    profileLevelEl.textContent = info.current.name;

    if (info.next) {
      var span = info.next.min - info.current.min;
      var progressed = state.balance - info.current.min;
      var pct = Math.max(0, Math.min(100, (progressed / span) * 100));
      levelProgressBarEl.style.width = pct + "%";
      levelProgressTextEl.textContent = state.balance + " / " + info.next.min + " to next level";
    } else {
      levelProgressBarEl.style.width = "100%";
      levelProgressTextEl.textContent = "You reached the highest level 🎉";
    }
  };

  var renderActivity = function () {
    if (!state.history.length) {
      activityListEl.innerHTML = '<li class="activity-empty muted">No activity yet</li>';
      return;
    }
    activityListEl.innerHTML = "";
    state.history.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "activity-item";
      li.innerHTML =
        '<span class="activity-item__label">' + item.label + '</span>' +
        '<span class="activity-item__amount">+' + item.amount + '</span>';
      activityListEl.appendChild(li);
    });
  };

  var renderCheckinDays = function () {
    checkinDaysEl.innerHTML = "";
    var checkedInToday = state.lastCheckin === todayKey();
    var currentDayIndex = checkedInToday ? state.streak - 1 : state.streak;

    for (var i = 0; i < 7; i++) {
      var div = document.createElement("div");
      div.className = "checkin-day";
      if (i < currentDayIndex || (checkedInToday && i <= currentDayIndex)) {
        div.classList.add("checkin-day--done");
      }
      if (i === currentDayIndex && !checkedInToday) {
        div.classList.add("checkin-day--today");
      }
      div.textContent = i + 1;
      checkinDaysEl.appendChild(div);
    }
  };

  var render = function () {
    balanceValueEl.textContent = state.balance;
    homeBalanceEl.textContent = state.balance;
    profileBalanceEl.textContent = state.balance;
    profileStreakEl.textContent = state.streak;
    profileNameEl.textContent = state.name;
    streakBadgeEl.textContent = "Day " + Math.min(state.streak + 1, 7);

    var checkedInToday = state.lastCheckin === todayKey();
    checkinBtn.disabled = checkedInToday;
    checkinBtn.textContent = checkedInToday ? "Claimed Today ✓" : "Claim Today's Reward";

    renderCheckinDays();

    taskJoinBtn.style.display = state.taskJoined ? "none" : "block";
    taskClaimBtn.disabled = !state.taskJoined || state.taskClaimed;
    taskClaimBtn.textContent = state.taskClaimed ? "Claimed ✓" : "Claim Reward";

    renderLevel();
    renderActivity();
    renderWithdrawals();
    updateAdButton();
    renderReflexState();
    renderQuiz();

    statCheckinsEl.textContent = state.totalCheckins;
    statGamesEl.textContent = state.totalGames;
    statBestEl.textContent = state.bestReaction ? state.bestReaction + " ms" : "—";
    topAvatarEl.textContent = (state.name || "S").trim().charAt(0).toUpperCase();
    topGreetEl.textContent = "Welcome, " + state.name;
    profileSinceEl.textContent = state.joinedAt;
  };

  // ---------- Daily check-in ----------
  checkinBtn.addEventListener("click", function () {
    var today = todayKey();
    if (state.lastCheckin === today) return;

    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var wasYesterday = state.lastCheckin === yesterday.toISOString().slice(0, 10);

    state.streak = wasYesterday ? Math.min(state.streak + 1, 6) : 0;
    state.lastCheckin = today;

    var reward = 10 + state.streak * 5;
    state.totalCheckins += 1;
    addBalance(reward, "Daily Check-in");
    showToast("+" + reward + " Spark 🎉");
    render();
  });

  // ---------- Lightning reflex game (skill-based, one attempt/day, 5 flashes) ----------
  var reflexZoneEl = document.getElementById("reflexZone");
  var reflexLabelEl = document.getElementById("reflexLabel");
  var reflexStartBtn = document.getElementById("reflexStartBtn");
  var reflexHintEl = document.getElementById("reflexHint");
  var reflexProgressEl = document.getElementById("reflexProgress");

  var ROUNDS = 5;
  var reflexRunning = false;
  var reflexRound = 0;
  var reflexTimes = [];
  var flashTimeout = null;
  var flashStart = 0;
  var waitingForFlash = false;

  var buildProgressDots = function (doneCount) {
    reflexProgressEl.innerHTML = "";
    for (var i = 0; i < ROUNDS; i++) {
      var dot = document.createElement("div");
      dot.className = "reflex-progress__dot" + (i < doneCount ? " reflex-progress__dot--done" : "");
      reflexProgressEl.appendChild(dot);
    }
  };

  var renderReflexState = function () {
    var playedToday = state.lastGameDate === todayKey();
    buildProgressDots(0);
    if (playedToday) {
      reflexStartBtn.disabled = true;
      reflexStartBtn.textContent = "Come back tomorrow for a new challenge";
      reflexHintEl.textContent = "Your average reaction time for today has already been recorded ⚡";
      reflexZoneEl.className = "reflex-zone reflex-zone--idle";
      reflexLabelEl.textContent = "Thanks for trying!";
    } else {
      reflexStartBtn.disabled = false;
      reflexStartBtn.textContent = "Start Challenge";
      reflexHintEl.textContent = "";
      reflexZoneEl.className = "reflex-zone reflex-zone--idle";
      reflexLabelEl.textContent = "Press Start";
    }
  };

  var scheduleFlash = function () {
    reflexZoneEl.className = "reflex-zone reflex-zone--waiting";
    reflexLabelEl.textContent = "Wait...";
    waitingForFlash = false;
    var delay = 900 + Math.random() * 2200;
    flashTimeout = setTimeout(function () {
      waitingForFlash = true;
      flashStart = performance.now();
      reflexZoneEl.className = "reflex-zone reflex-zone--live";
      reflexLabelEl.textContent = "⚡";
    }, delay);
  };

  var nextRoundOrFinish = function () {
    reflexRound += 1;
    buildProgressDots(reflexRound);
    if (reflexRound >= ROUNDS) {
      finishReflexGame();
    } else {
      setTimeout(scheduleFlash, 500);
    }
  };

  var finishReflexGame = function () {
    reflexRunning = false;
    var avg = Math.round(reflexTimes.reduce(function (a, b) { return a + b; }, 0) / reflexTimes.length);

    var reward;
    if (avg <= 250) reward = 60;
    else if (avg <= 350) reward = 45;
    else if (avg <= 450) reward = 30;
    else if (avg <= 600) reward = 20;
    else reward = 10;

    state.lastGameDate = todayKey();
    state.totalGames += 1;
    if (state.bestReaction === null || avg < state.bestReaction) {
      state.bestReaction = avg;
    }
    addBalance(reward, "Lightning Challenge");
    showToast("Your average is " + avg + " ms — you earned " + reward + " Spark ⚡");
    reflexHintEl.textContent = "Your reaction average: " + avg + " ms";
    render();
  };

  reflexZoneEl.addEventListener("click", function () {
    if (!reflexRunning) return;

    if (waitingForFlash) {
      var elapsed = Math.round(performance.now() - flashStart);
      reflexTimes.push(elapsed);
      waitingForFlash = false;
      reflexZoneEl.className = "reflex-zone reflex-zone--hit";
      reflexLabelEl.textContent = elapsed + " ms";
      nextRoundOrFinish();
    } else {
      // ضغط مبكر قبل ظهور البرق — يُعاد جدولة نفس الجولة بدون احتساب وقت
      clearTimeout(flashTimeout);
      reflexZoneEl.className = "reflex-zone reflex-zone--early";
      reflexLabelEl.textContent = "Too early! 😅";
      setTimeout(scheduleFlash, 700);
    }
  });

  reflexStartBtn.addEventListener("click", function () {
    if (state.lastGameDate === todayKey()) return;
    reflexRunning = true;
    reflexRound = 0;
    reflexTimes = [];
    reflexStartBtn.disabled = true;
    buildProgressDots(0);
    scheduleFlash();
  });

  // ---------- Daily trivia quiz ----------
  var QUESTION_BANK = [
    { q: "What is the largest ocean in the world?", options: ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean"], correct: 0 },
    { q: "How many sides does a triangle have?", options: ["Two", "Three", "Four", "Five"], correct: 1 },
    { q: "What is the capital of Japan?", options: ["Seoul", "Beijing", "Tokyo", "Bangkok"], correct: 2 },
    { q: "Which gas do humans primarily breathe?", options: ["Carbon dioxide", "Hydrogen", "Nitrogen", "Oxygen"], correct: 3 },
    { q: "How many planets are in the Solar System?", options: ["Six", "Seven", "Eight", "Nine"], correct: 2 },
    { q: "Who invented the electric light bulb?", options: ["Newton", "Edison", "Einstein", "Tesla"], correct: 1 },
    { q: "What is the longest river in the world?", options: ["Nile River", "Amazon River", "Euphrates River", "Tigris River"], correct: 0 },
    { q: "How many days are in a leap year?", options: ["364", "365", "366", "367"], correct: 2 },
    { q: "What is the unit of electric current?", options: ["Volt", "Ohm", "Ampere", "Watt"], correct: 2 },
    { q: "Which of these animals lives both in water and on land?", options: ["Lion", "Frog", "Eagle", "Camel"], correct: 1 }
  ];

  var quizQuestionEl = document.getElementById("quizQuestion");
  var quizOptionsEl = document.getElementById("quizOptions");
  var quizResultEl = document.getElementById("quizResult");

  var getTodayQuestion = function () {
    var idx = dayNumber() % QUESTION_BANK.length;
    return QUESTION_BANK[idx];
  };

  var renderQuiz = function () {
    var today = todayKey();
    if (state.quizDate !== today) {
      state.quizDate = today;
      state.quizAnswered = false;
      saveState();
    }

    var question = getTodayQuestion();
    quizQuestionEl.textContent = question.q;
    quizOptionsEl.innerHTML = "";
    quizResultEl.textContent = "";

    question.options.forEach(function (opt, idx) {
      var btn = document.createElement("button");
      btn.className = "quiz-option";
      btn.textContent = opt;
      if (state.quizAnswered) {
        btn.disabled = true;
        if (idx === question.correct) btn.classList.add("quiz-option--correct");
      } else {
        btn.addEventListener("click", function () {
          answerQuiz(idx, question);
        });
      }
      quizOptionsEl.appendChild(btn);
    });

    if (state.quizAnswered) {
      quizResultEl.textContent = "You already answered today's question — come back tomorrow for a new one 🧠";
    }
  };

  var answerQuiz = function (chosenIdx, question) {
    if (state.quizAnswered) return;
    state.quizAnswered = true;

    var buttons = quizOptionsEl.querySelectorAll(".quiz-option");
    buttons.forEach(function (b) { b.disabled = true; });

    if (chosenIdx === question.correct) {
      buttons[chosenIdx].classList.add("quiz-option--correct");
      addBalance(25, "Question of the Day");
      showToast("Correct answer! +25 Spark 🧠");
      quizResultEl.textContent = "Great job! Correct answer.";
    } else {
      buttons[chosenIdx].classList.add("quiz-option--wrong");
      buttons[question.correct].classList.add("quiz-option--correct");
      saveState();
      showToast("Incorrect answer");
      quizResultEl.textContent = "Incorrect answer — the correct answer is shown above.";
    }
    render();
  };

  // ---------- Task ----------
  taskJoinBtn.addEventListener("click", function () {
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink(CHANNEL_URL);
    } else {
      window.open(CHANNEL_URL, "_blank");
    }
    state.taskJoined = true;
    saveState();
    render();
  });

  taskClaimBtn.addEventListener("click", function () {
    if (!state.taskJoined || state.taskClaimed) return;
    state.taskClaimed = true;
    addBalance(50, "Channel Join");
    showToast("+50 Spark 🎁");
    render();
  });

  // ---------- AdsGram reward ad ----------
  // Reward إضافية اختيارية عبر Watched Ad — لا تؤثر على أي وظيفة أساسية بالتطبيق
  // (Daily Check-in، Lightning Challenge، الكويز، والمهمة تعمل جميعها بدون أي إعلان)
  var AD_BLOCK_ID = (window.CONFIG && window.CONFIG.ADSGRAM_BLOCK_ID) || "";
  var AD_REWARD = 20;
  var MAX_ADS_PER_DAY = 3;
  var AdController = null;

  if (window.Adsgram && AD_BLOCK_ID && AD_BLOCK_ID.indexOf("REPLACE_WITH") !== 0) {
    try {
      AdController = window.Adsgram.init({ blockId: AD_BLOCK_ID });
    } catch (e) {
      AdController = null;
    }
  }

  var resetAdCounterIfNewDay = function () {
    if (state.adsDate !== todayKey()) {
      state.adsDate = todayKey();
      state.adsWatchedToday = 0;
      saveState();
    }
  };

  var updateAdButton = function () {
    resetAdCounterIfNewDay();
    var remaining = MAX_ADS_PER_DAY - state.adsWatchedToday;

    if (!AdController) {
      watchAdBtn.disabled = true;
      adHintEl.textContent = "Ads are currently unavailable";
      return;
    }

    if (remaining > 0) {
      watchAdBtn.disabled = false;
      watchAdBtn.textContent = "Watch Ad (+" + AD_REWARD + " Spark)";
      adHintEl.textContent = "Remaining " + remaining + " of " + MAX_ADS_PER_DAY + " views today";
    } else {
      watchAdBtn.disabled = true;
      watchAdBtn.textContent = "You have used all your views for today";
      adHintEl.textContent = "Come back tomorrow for more rewards";
    }
  };

  watchAdBtn.addEventListener("click", function () {
    if (!AdController) return;
    resetAdCounterIfNewDay();
    if (state.adsWatchedToday >= MAX_ADS_PER_DAY) return;

    watchAdBtn.disabled = true;
    AdController.show()
      .then(function () {
        state.adsWatchedToday += 1;
        addBalance(AD_REWARD, "Watched Ad");
        showToast("+" + AD_REWARD + " Spark 🎬");
        render();
      })
      .catch(function () {
        showToast("Ad viewing was not completed");
      })
      .finally(function () {
        updateAdButton();
      });
  });

  render();

  // Splash screen
  var splashEl = document.getElementById("splash");
  setTimeout(function () {
    splashEl.classList.add("splash--hidden");
    setTimeout(function () { splashEl.remove(); }, 400);
  }, 650);
})();
