# Gold Rush Mines — لعبة الكاوبوي غيرل 🤠

## طريقة اللعب
- كل خطوة فيها **بابين**: واحد فيه ذهب 🪙 والثاني فيه لغم 💣 (50/50 يتحدد من الـseed قبل أول اختيار — Provably Fair).
- كل ذهب يرفع المضاعف **+1x**: ‏2x ← 3x ← 4x … لين **25x** (24 ذهب ورا بعض)، وعند 25x يتم السحب تلقائياً.
- **السحب متاح بأي وقت** بعد أول ذهب. اللغم = خسارة الرهان.

## وين تظهر
- أول لعبة في قائمة الألعاب، وأول مربع في Home (Trending).
- البانر الأفقي = `public/images/games/goldrush.webp`
- المربع = `goldrush-square.webp`
- فريم داخل اللعبة = `goldrush-frame.webp` (فيه مربع المضاعف + شريط الرسائل، والأبواب مرسومة فوقه ويتكيف مع أي حجم شاشة)

## خطوات التركيب (مهم)
1. شغّل `sql/goldrush_game.sql` مرة وحدة في Supabase → SQL Editor.
   (بدونه اللعبة تبقى مخفية، لأن جدول الجولات ما يعرف اسمها)
2. ارفع المشروع وشغّل `npm run build` (الـDockerfile يسويه تلقائياً) — يولّد `server/game-service.gen.js`.
3. من الأدمن ← الإعدادات ← الألعاب: خيار **Gold Rush Mines مفعّل** للتشغيل/الإيقاف.

## الملفات
- جديد: `src/games/GoldRush.tsx`، `sql/goldrush_game.sql`
- معدّل: `shared/engine.ts` و `shared/game-service.ts` (المنطق والسيرفر)، `src/lib/games.ts`، `src/App.tsx`، `src/lib/api.ts` (الديمو)، `server/api/player.js`، `server/lib/store.js`، `server/api/admin.js`، `public/admin.html`، `src/components/HowTo.tsx`، الترجمات الأربع، `src/index.css`

## ملاحظة على الـRTP
المضاعف خطي (+1x) والفرصة 50/50، فالنتيجة المتوقعة لو سحب اللاعب من أول ذهب = **100%** (بدون ربح للبيت)، ولو كمل: خطوتين ≈ 75%، ثلاث ≈ 52%، خمس ≈ 18%.
لو تبي هامش للبيت على أول خطوة غيّر `goldMult` في `shared/engine.ts`.
