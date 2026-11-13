# إعداد بوت ODDXS في تلغرام

## 1) إنشاء البوت (@BotFather)
1. `/newbot` → اسم: **ODDXS** → يوزر: `your_oddxs_bot` → انسخ التوكن إلى `TELEGRAM_BOT_TOKEN`.
2. `/setdescription` → الصق:
```
🎰 ODDXS — العب مجاناً واربح!
شاهد إعلانات → اجمع نقاط → العب Crash وMines وDice وBlackjack → اسحب إلى Gram أو Binance.
```
3. `/setabouttext` → `ألعاب مجانية. اجمع نقاط من الإعلانات واسحب أرباحك. 18+`
4. `/setcommands` →
```
start - افتح ODDXS
help - مساعدة
```
5. Mini App: `/newapp` (اختر البوت) → رابط التطبيق = `WEBAPP_URL` → ثم `/setmenubutton` لزر القائمة،
   أو اجعله Main Mini App من BotFather → Bot Settings → Configure Mini App.

## 2) رسالة /start (قابلة للتعديل من لوحة الأدمن → الإعدادات)
**العربية**
```
أهلاً بك في ODDXS! 🎰

شاهد إعلانات، اجمع نقاط، والعب Crash وMines وDice وBlackjack مجاناً.
اسحب أرباحك إلى Gram أو Binance. 🚀
```
**English**
```
Welcome to ODDXS! 🎰

Watch ads, collect points and play Crash, Mines, Dice and Blackjack for free. Withdraw to Gram or Binance. 🚀
```
تظهر تحتها زر **افتح ODDXS 🎰**. رسائل الإشعار (تم الدفع / رُفض السحب) تُرسل تلقائياً بالعربي والإنجليزي.

## 3) روابط الدعوة
`https://t.me/your_oddxs_bot?start=ref_<TELEGRAM_ID>` — المدعو يُسجَّل مع الداعي، والداعي يستلم المكافأة بعد أن يشاهد المدعو عدد الإعلانات المحدد في الإعدادات.
