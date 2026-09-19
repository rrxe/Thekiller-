// Stormy — خادم Express يقدّم الـ Mini App + بوت تيليجرام (grammY, long polling)
//
// المتغيرات البيئية المطلوبة (راجع .env.example):
// BOT_TOKEN    - توكن البوت of BotFather
// WEBAPP_URL   - رابط HTTPS الذي يفتح فيه التطبيق (نفس الدومين الذي يخدّمه هذا السيرفر)
// CHANNEL_URL  - رابط قناة تيليجرام لمهمة "Channel Join"
// PORT         - المنفذ (اختياري، افتراضيًا 3000)

require("dotenv").config();

const path = require("path");
const express = require("express");
const { Bot, InlineKeyboard } = require("grammy");

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

// ---------- Web server (يخدّم الـ Mini App) ----------
const app = express();
app.use(express.static(path.join(__dirname, "public")));

// نقطة فحص صحة بسيطة، مفيدة لـ Dokploy / أي health check
app.get("/health", (req, res) => res.status(200).send("ok"));

app.listen(PORT, () => {
  console.log(`[web] Stormy web app running on port ${PORT}`);
});

// ---------- Telegram bot ----------
if (!BOT_TOKEN) {
  console.warn(
    "[bot] BOT_TOKEN is missing — the web server will run without the bot."
  );
} else {
  const bot = new Bot(BOT_TOKEN);

  bot.command("start", async (ctx) => {
    if (!WEBAPP_URL) {
      await ctx.reply(
        "Welcome to Stormy ⚡\n" +
          "The app URL is not configured yet (WEBAPP_URL). Please contact the bot administrator."
      );
      return;
    }

    const keyboard = new InlineKeyboard().webApp("⚡ Open Stormy", WEBAPP_URL);

    await ctx.reply(
      "Welcome to Stormy ⚡\n" +
        "Check in daily, try the lightning reaction challenge, answer the question of the day, " +
        "complete tasks, and collect points.\n\n" +
        "Press the button below to open the app:",
      { reply_markup: keyboard }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "⚡ Stormy — Available commands:\n" +
        "/start — Open the app\n" +
        "/help — Show this message"
    );
  });

  bot.catch((err) => {
    console.error("[bot] Error:", err);
  });

  bot.start();
  console.log("[bot] Telegram bot started (long polling)");
}
