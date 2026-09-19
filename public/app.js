// Stormy — تطبيق مبني على localStorage (بدون خادم بيانات)، بميزات أصلية:
// تسجيل دخول يومي بسلسلة 7 أيام، تحدي رد فعل مهارة حقيقية (لعبة البرق)،
// سؤال يومي (كويز معلومات عامة)، مهمة انضمام لقناة، وإعلان مكافأة اختياري.

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

  // رقم يوم ثابت لكل تاريخ، يُستخدم لاختيار سؤال الكويز اليومي بشكل حتمي
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
      name: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || "لاعب Stormy",
      joinedAt: todayKey(),
      totalCheckins: 0,
      totalGames: 0,
      bestReaction: null, // أفضل متوسط رد فعل بالمللي ثانية (أقل = أفضل)
      lastGameDate: null,
      quizDate: null,
      quizAnswered: false,
      adsWatchedToday: 0,
      adsDate: todayKey(),
      history: []
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

  var addBalance = function (amount, label) {
    state.balance += amount;
    if (label) {
      state.history.unshift({ label: label, amount: amount, date: todayKey() });
      state.history = state.history.slice(0, 8);
    }
    saveState();
  };

  var LEVELS = [
    { name: "عاصفة ناشئة", icon: "🌩️", min: 0 },
    { name: "عاصفة متوسطة", icon: "⛈️", min: 200 },
    { name: "عاصفة كبرى", icon: "🌪️", min: 600 },
    { name: "إعصار Stormy", icon: "⚡", min: 1500 }
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
      levelProgressTextEl.textContent = state.balance + " / " + info.next.min + " للمستوى التالي";
    } else {
      levelProgressBarEl.style.width = "100%";
      levelProgressTextEl.textContent = "وصلت لأعلى مستوى 🎉";
    }
  };

  var renderActivity = function () {
    if (!state.history.length) {
      activityListEl.innerHTML = '<li class="activity-empty muted">لا يوجد نشاط بعد</li>';
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
    streakBadgeEl.textContent = "يوم " + Math.min(state.streak + 1, 7);

    var checkedInToday = state.lastCheckin === todayKey();
    checkinBtn.disabled = checkedInToday;
    checkinBtn.textContent = checkedInToday ? "تم الاستلام اليوم ✓" : "استلام مكافأة اليوم";

    renderCheckinDays();

    taskJoinBtn.style.display = state.taskJoined ? "none" : "block";
    taskClaimBtn.disabled = !state.taskJoined || state.taskClaimed;
    taskClaimBtn.textContent = state.taskClaimed ? "تم الاستلام ✓" : "استلام المكافأة";

    renderLevel();
    renderActivity();
    updateAdButton();
    renderReflexState();
    renderQuiz();

    statCheckinsEl.textContent = state.totalCheckins;
    statGamesEl.textContent = state.totalGames;
    statBestEl.textContent = state.bestReaction ? state.bestReaction + " ms" : "—";
    topAvatarEl.textContent = (state.name || "S").trim().charAt(0).toUpperCase();
    topGreetEl.textContent = "مرحبًا، " + state.name;
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
    addBalance(reward, "تسجيل دخول يومي");
    showToast("+" + reward + " شرارة 🎉");
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
      reflexStartBtn.textContent = "عد غدًا لتحدٍ جديد";
      reflexHintEl.textContent = "آخر متوسط رد فعل لك اليوم كان مسجّلًا بالفعل ⚡";
      reflexZoneEl.className = "reflex-zone reflex-zone--idle";
      reflexLabelEl.textContent = "شكرًا على المحاولة!";
    } else {
      reflexStartBtn.disabled = false;
      reflexStartBtn.textContent = "ابدأ التحدي";
      reflexHintEl.textContent = "";
      reflexZoneEl.className = "reflex-zone reflex-zone--idle";
      reflexLabelEl.textContent = "اضغط ابدأ";
    }
  };

  var scheduleFlash = function () {
    reflexZoneEl.className = "reflex-zone reflex-zone--waiting";
    reflexLabelEl.textContent = "انتظر...";
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
    addBalance(reward, "تحدي البرق");
    showToast("متوسطك " + avg + " ms — ربحت " + reward + " شرارة ⚡");
    reflexHintEl.textContent = "متوسط رد فعلك: " + avg + " ms";
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
      reflexLabelEl.textContent = "بدري! 😅";
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
    { q: "ما هو أكبر محيط في العالم؟", options: ["المحيط الهادئ", "المحيط الأطلسي", "المحيط الهندي", "المحيط المتجمد الشمالي"], correct: 0 },
    { q: "كم عدد أضلاع المثلث؟", options: ["اثنان", "ثلاثة", "أربعة", "خمسة"], correct: 1 },
    { q: "ما هي عاصمة اليابان؟", options: ["سيول", "بكين", "طوكيو", "بانكوك"], correct: 2 },
    { q: "ما هو الغاز الذي يتنفسه الإنسان بشكل أساسي؟", options: ["ثاني أكسيد الكربون", "الهيدروجين", "النيتروجين", "الأكسجين"], correct: 3 },
    { q: "كم عدد كواكب المجموعة الشمسية؟", options: ["ستة", "سبعة", "ثمانية", "تسعة"], correct: 2 },
    { q: "من مخترع المصباح الكهربائي؟", options: ["نيوتن", "أديسون", "أينشتاين", "تسلا"], correct: 1 },
    { q: "ما هي أطول نهر في العالم؟", options: ["نهر النيل", "نهر الأمازون", "نهر الفرات", "نهر دجلة"], correct: 0 },
    { q: "كم عدد أيام السنة الكبيسة؟", options: ["364", "365", "366", "367"], correct: 2 },
    { q: "ما هي وحدة قياس شدة التيار الكهربائي؟", options: ["فولت", "أوم", "أمبير", "واط"], correct: 2 },
    { q: "أي هذه الحيوانات يعيش في الماء والبر؟", options: ["الأسد", "الضفدع", "النسر", "الجمل"], correct: 1 }
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
      quizResultEl.textContent = "أجبت على سؤال اليوم بالفعل — عد غدًا لسؤال جديد 🧠";
    }
  };

  var answerQuiz = function (chosenIdx, question) {
    if (state.quizAnswered) return;
    state.quizAnswered = true;

    var buttons = quizOptionsEl.querySelectorAll(".quiz-option");
    buttons.forEach(function (b) { b.disabled = true; });

    if (chosenIdx === question.correct) {
      buttons[chosenIdx].classList.add("quiz-option--correct");
      addBalance(25, "سؤال اليوم");
      showToast("إجابة صحيحة! +25 شرارة 🧠");
      quizResultEl.textContent = "أحسنت! إجابة صحيحة.";
    } else {
      buttons[chosenIdx].classList.add("quiz-option--wrong");
      buttons[question.correct].classList.add("quiz-option--correct");
      saveState();
      showToast("إجابة غير صحيحة");
      quizResultEl.textContent = "إجابة غير صحيحة — الصح موضّح بالأعلى.";
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
    addBalance(50, "الانضمام للقناة");
    showToast("+50 شرارة 🎁");
    render();
  });

  // ---------- AdsGram reward ad ----------
  // مكافأة إضافية اختيارية عبر مشاهدة إعلان — لا تؤثر على أي وظيفة أساسية بالتطبيق
  // (تسجيل الدخول اليومي، تحدي البرق، الكويز، والمهمة تعمل جميعها بدون أي إعلان)
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
      adHintEl.textContent = "الإعلانات غير متاحة حاليًا";
      return;
    }

    if (remaining > 0) {
      watchAdBtn.disabled = false;
      watchAdBtn.textContent = "شاهد إعلان (+" + AD_REWARD + " شرارة)";
      adHintEl.textContent = "متبقي " + remaining + " من " + MAX_ADS_PER_DAY + " مشاهدات اليوم";
    } else {
      watchAdBtn.disabled = true;
      watchAdBtn.textContent = "استخدمت كل مشاهداتك اليوم";
      adHintEl.textContent = "عد غدًا لمزيد من المكافآت";
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
        addBalance(AD_REWARD, "مشاهدة إعلان");
        showToast("+" + AD_REWARD + " شرارة 🎬");
        render();
      })
      .catch(function () {
        showToast("لم تكتمل مشاهدة الإعلان");
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
