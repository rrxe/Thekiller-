// Stormy — خادم Express يقدّم الـ Mini App + بوت تيليجرام (grammY, long polling)
//
// المتغيرات البيئية المطلوبة (راجع .env.example):
// BOT_TOKEN    - توكن البوت من BotFather
// WEBAPP_URL   - رابط HTTPS الذي يفتح فيه التطبيق (نفس الدومين الذي يخدّمه هذا السيرفر)
// CHANNEL_URL  - رابط قناة تيليجرام لمهمة "الانضمام للقناة"
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
    "[bot] BOT_TOKEN غير موجود — سيتم تشغيل خادم الويب فقط بدون البوت."
  );
} else {
  const bot = new Bot(BOT_TOKEN);

  bot.command("start", async (ctx) => {
    if (!WEBAPP_URL) {
      await ctx.reply(
        "أهلًا بك في Stormy ⚡\n" +
          "لم يتم ضبط رابط التطبيق بعد (WEBAPP_URL)، تواصل مع مسؤول البوت."
      );
      return;
    }

    const keyboard = new InlineKeyboard().webApp("⚡ فتح Stormy", WEBAPP_URL);

    await ctx.reply(
      "أهلًا بك في Stormy ⚡\n" +
        "سجّل دخولك اليومي، جرّب تحدي البرق لرد الفعل، جاوب على سؤال اليوم، " +
        "وأنجز المهام لتجمع النقاط.\n\n" +
        "اضغط الزر أدناه لفتح التطبيق:",
      { reply_markup: keyboard }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "⚡ Stormy — الأوامر المتاحة:\n" +
        "/start — فتح التطبيق\n" +
        "/help — عرض هذه الرسالة"
    );
  });

  bot.catch((err) => {
    console.error("[bot] Error:", err);
  });

  bot.start();
  console.log("[bot] Telegram bot started (long polling)");
}
