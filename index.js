require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("./db");
const { authMiddleware } = require("./middleware/auth");
const { setupBot } = require("./bot");

const app = express();
app.use(cors());
app.use(express.json());

const bot = setupBot(process.env.BOT_TOKEN, process.env.WEBAPP_URL);

app.post("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { id, username, first_name } = req.tgUser;
    const tgIdStr = id.toString();

    let user = await db.get("SELECT * FROM users WHERE telegram_id = ?", [tgIdStr]);

    if (!user) {
      const newId = uuidv4();
      await db.run(
        "INSERT INTO users (id, telegram_id, username, first_name) VALUES (?, ?, ?, ?)",
        [newId, tgIdStr, username || "", first_name || ""]
      );
      user = await db.get("SELECT * FROM users WHERE id = ?", [newId]);
    }

    const referralCount = await db.get(
      "SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?",
      [user.id]
    );

    res.json({
      id: user.id,
      telegramId: user.telegram_id,
      username: user.username,
      firstName: user.first_name,
      coins: user.coins,
      usdt: user.usdt,
      walletAddress: user.wallet_address,
      isAdmin: Boolean(user.is_admin),
      referralsCount: referralCount.count,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get("SELECT id FROM users WHERE telegram_id = ?", [req.tgUser.id.toString()]);

    const tasks = await db.all("SELECT * FROM tasks WHERE is_active = 1");
    const completedTasks = await db.all("SELECT task_id FROM user_tasks WHERE user_id = ?", [user.id]);
    const completedSet = new Set(completedTasks.map((t) => t.task_id));

    const result = tasks.map((task) => ({
      ...task,
      isCompleted: completedSet.has(task.id),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/withdraw", authMiddleware, async (req, res) => {
  try {
    const { amountUsdt, walletAddress } = req.body;
    const db = await getDb();
    const user = await db.get("SELECT * FROM users WHERE telegram_id = ?", [req.tgUser.id.toString()]);

    if (!amountUsdt || amountUsdt <= 0 || user.usdt < amountUsdt) {
      return res.status(400).json({ error: "Insufficient USDT balance" });
    }

    await db.run("UPDATE users SET usdt = usdt - ?, wallet_address = ? WHERE id = ?", [
      amountUsdt,
      walletAddress,
      user.id,
    ]);

    await db.run(
      "INSERT INTO withdrawals (id, user_id, amount_usdt, wallet_address) VALUES (?, ?, ?, ?)",
      [uuidv4(), user.id, amountUsdt, walletAddress]
    );

    res.json({ success: true, message: "Withdrawal requested successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/withdrawals", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const admin = await db.get("SELECT is_admin FROM users WHERE telegram_id = ?", [req.tgUser.id.toString()]);
    if (!admin || !admin.is_admin) return res.status(403).json({ error: "Unauthorized" });

    const withdrawals = await db.all(`
      SELECT w.*, u.username, u.telegram_id
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      ORDER BY w.created_at DESC
    `);

    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/withdrawals/status", authMiddleware, async (req, res) => {
  try {
    const { withdrawalId, status } = req.body;
    const db = await getDb();

    const withdrawal = await db.get("SELECT * FROM withdrawals WHERE id = ?", [withdrawalId]);
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

    if (status === "REJECTED" && withdrawal.status === "PENDING") {
      await db.run("UPDATE users SET usdt = usdt + ? WHERE id = ?", [
        withdrawal.amount_usdt,
        withdrawal.user_id,
      ]);
    }

    await db.run("UPDATE withdrawals SET status = ? WHERE id = ?", [status, withdrawalId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/tasks", authMiddleware, async (req, res) => {
  try {
    const { title, rewardCoins, linkUrl } = req.body;
    const db = await getDb();

    await db.run(
      "INSERT INTO tasks (id, title, reward_coins, link_url) VALUES (?, ?, ?, ?)",
      [uuidv4(), title, rewardCoins, linkUrl]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/broadcast", authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!bot) return res.status(400).json({ error: "Bot not initialized" });

    const db = await getDb();
    const users = await db.all("SELECT telegram_id FROM users");

    let sentCount = 0;
    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.telegram_id, message);
        sentCount++;
      } catch (e) {}
    }

    res.json({ success: true, sentCount });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
