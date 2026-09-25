require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

const DB_FILE = path.join(__dirname, 'db.json');

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: [], tasks: [], withdrawals: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.use(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('tga ')) {
    const initData = authHeader.split(' ')[1];
    try {
      const urlParams = new URLSearchParams(initData);
      const userStr = urlParams.get('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        req.userTelegramId = userData.id.toString();
        req.username = userData.username || '';
        req.firstName = userData.first_name || '';
      }
    } catch (e) {}
  }
  next();
});

function getOrCreateUser(telegramId, username = '', firstName = '', referredBy = null) {
  const db = loadDb();
  let user = db.users.find(u => u.telegram_id === telegramId);
  
  if (!user) {
    let finalReferredBy = null;
    if (referredBy && referredBy !== telegramId) {
      const referrer = db.users.find(u => u.telegram_id === referredBy);
      if (referrer) {
        finalReferredBy = referredBy;
        referrer.coins += 500;
      }
    }

    const isAdmin = db.users.length === 0 ? 1 : 0;

    user = {
      telegram_id: telegramId,
      username,
      first_name: firstName,
      coins: 250,
      usdt: 0.0,
      wallet_address: '',
      is_admin: isAdmin,
      last_checkin: null,
      referred_by: finalReferredBy,
      created_at: new Date().toISOString()
    };
    db.users.push(user);
    saveDb(db);
  }
  return user;
}

app.post('/api/auth/me', (req, res) => {
  const telegramId = req.userTelegramId || "123456789";
  const username = req.username || "user";
  const firstName = req.firstName || "User";

  const user = getOrCreateUser(telegramId, username, firstName);
  const db = loadDb();
  const refsCount = db.users.filter(u => u.referred_by === telegramId).length;

  res.json({
    telegramId: user.telegram_id,
    coins: user.coins,
    usdt: user.usdt,
    isAdmin: user.is_admin === 1,
    referralsCount: refsCount
  });
});

app.post('/api/daily-checkin', (req, res) => {
  const telegramId = req.userTelegramId || "123456789";
  const today = new Date().toISOString().split('T')[0];

  const db = loadDb();
  let user = db.users.find(u => u.telegram_id === telegramId);
  if (!user) {
    user = getOrCreateUser(telegramId);
    db.users = loadDb().users;
  }

  if (user.last_checkin === today) {
    return res.json({ error: "لقد استلمت مكافأتك اليوم بالفعل!" });
  }

  user.coins += 100;
  user.last_checkin = today;
  saveDb(db);

  res.json({ success: true, reward: 100 });
});

// API: Leaderboard (Top users by coins)
app.get('/api/leaderboard', (req, res) => {
  const db = loadDb();
  const topUsers = db.users
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 10)
    .map((u, index) => ({
      rank: index + 1,
      name: u.username || u.first_name || 'User',
      coins: u.coins.toLocaleString(),
      tier: u.coins > 10000 ? 'Mythic' : u.coins > 5000 ? 'Legendary' : 'Normal'
    }));
  res.json(topUsers);
});

app.get('/api/tasks', (req, res) => {
  const db = loadDb();
  res.json(db.tasks);
});

app.post('/api/withdraw', (req, res) => {
  const telegramId = req.userTelegramId || "123456789";
  const { amount, wallet } = req.body;
  
  const db = loadDb();
  let user = db.users.find(u => u.telegram_id === telegramId);
  if (!user || user.usdt < amount) {
    return res.status(400).json({ error: "رصيد الـ USDT غير كافٍ" });
  }

  user.usdt -= amount;
  db.withdrawals.push({
    id: Date.now(),
    telegram_id: telegramId,
    amount_usdt: amount,
    wallet_address: wallet,
    status: 'PENDING',
    created_at: new Date().toISOString()
  });
  saveDb(db);
  
  res.json({ success: true });
});

function isAdmin(req, res, next) {
  const telegramId = req.userTelegramId;
  if (!telegramId) return res.status(401).json({ error: "Unauthorized" });
  const db = loadDb();
  const user = db.users.find(u => u.telegram_id === telegramId);
  if (!user || user.is_admin !== 1) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

app.get('/api/admin/withdrawals', isAdmin, (req, res) => {
  const db = loadDb();
  const withdrawals = db.withdrawals.map(w => {
    const u = db.users.find(usr => usr.telegram_id === w.telegram_id);
    return { ...w, username: u ? u.username : '' };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  res.json(withdrawals);
});

app.post('/api/admin/withdrawals/status', isAdmin, (req, res) => {
  const { withdrawalId, status } = req.body;
  const db = loadDb();
  const withdrawal = db.withdrawals.find(w => w.id == withdrawalId);
  if (!withdrawal) return res.status(404).json({ error: "Not found" });

  if (status === 'REJECTED' && withdrawal.status === 'PENDING') {
    const u = db.users.find(usr => usr.telegram_id === withdrawal.telegram_id);
    if (u) u.usdt += withdrawal.amount_usdt;
  }

  withdrawal.status = status;
  saveDb(db);
  res.json({ success: true });
});

app.post('/api/admin/tasks', isAdmin, (req, res) => {
  const { title, rewardCoins, linkUrl } = req.body;
  const db = loadDb();
  db.tasks.push({
    id: Date.now(),
    title,
    reward_coins: rewardCoins,
    link_url: linkUrl
  });
  saveDb(db);
  res.json({ success: true });
});

app.post('/api/admin/broadcast', isAdmin, async (req, res) => {
  const { message } = req.body;
  const db = loadDb();
  let sentCount = 0;
  for (const u of db.users) {
    try {
      await bot.telegram.sendMessage(u.telegram_id, message);
      sentCount++;
    } catch (e) {}
  }
  res.json({ success: true, sentCount });
});

bot.start(async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const username = ctx.from.username || '';
  const firstName = ctx.from.first_name || '';
  
  const payload = ctx.payload;
  let referredBy = null;
  if (payload && payload.startsWith('ref_')) {
    referredBy = payload.replace('ref_', '');
  }

  getOrCreateUser(telegramId, username, firstName, referredBy);

  ctx.reply('Welcome to ComicX Mint! 🚀', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Open ComicX (Mini App)', web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }]
      ]
    }
  });
});

bot.command('admin', (ctx) => {
  const telegramId = ctx.from.id.toString();
  const db = loadDb();
  const user = db.users.find(u => u.telegram_id === telegramId);
  
  if (user && user.is_admin === 1) {
    ctx.reply('Admin panel:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛠️ Open Admin Panel', web_app: { url: `${process.env.WEBAPP_URL}/admin.html` } }]
        ]
      }
    });
  } else {
    ctx.reply('You do not have admin access.');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
bot.launch();
