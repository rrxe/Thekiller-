// How-to-play sheet: plain text steps (bilingual), no illustrations.
import { useEffect } from "react";
import { useLang, useTx } from "../lib/i18n";
import { Sheet } from "./ui";
import { sfx } from "../lib/sfx";
import type { GameId } from "../../shared/game-service";

type Step = { en: [string, string]; ar: [string, string]; ru?: [string, string]; hi?: [string, string] };

const TEXT: Record<GameId, Step[]> = {
  goldrush: [
    { en: ["1 · Pick a door", "Each step shows two doors: one hides gold, the other hides a mine. Set your bet and start digging."], ar: ["١ · اختر باباً", "كل خطوة فيها بابين: واحد فيه ذهب والثاني فيه لغم. حدد مبلغ اللعب وابدأ الحفر."], ru: ["1 · Выберите дверь", "На каждом шаге две двери: за одной золото, за другой мина. Задайте ставку и начинайте."], hi: ["1 · दरवाज़ा चुनें", "हर कदम पर दो दरवाज़े होते हैं: एक में सोना, दूसरे में माइन। बेट तय करके खुदाई शुरू करें।"] },
    { en: ["2 · Climb to 25x", "Every gold adds +1x: 2x, 3x, 4x … up to 25x. A mine ends the round and the bet is lost."], ar: ["٢ · اصعد لين 25x", "كل ذهب يزيد المضاعف 1x: 2x ثم 3x ثم 4x … لين 25x. اللغم ينهي الجولة وتخسر مبلغ اللعب."], ru: ["2 · Поднимайтесь до 25x", "Каждое золото добавляет +1x: 2x, 3x, 4x … до 25x. Мина завершает раунд, ставка проиграна."], hi: ["2 · 25x तक चढ़ें", "हर सोना +1x जोड़ता है: 2x, 3x, 4x … 25x तक। माइन मिलते ही राउंड खत्म और बेट हार जाती है।"] },
    { en: ["3 · Cash out any time", "After the first gold you can cash out whenever you like and keep bet × multiplier. Reaching 25x pays out automatically."], ar: ["٣ · اسحب متى شئت", "بعد أول ذهب تقدر تسحب بأي وقت وتاخذ الرهان × المضاعف. عند الوصول إلى 25x يتم السحب تلقائياً."], ru: ["3 · Забирайте в любой момент", "После первого золота можно забрать ставка × множитель когда угодно. На 25x выплата произойдёт автоматически."], hi: ["3 · कभी भी कैश आउट करें", "पहले सोने के बाद आप कभी भी कैश आउट करके बेट × मल्टीप्लायर रख सकते हैं। 25x पर कैश-आउट अपने-आप हो जाता है।"] },
  ],
  crash: [
    { en: ["1 · Place your bet", "Set your bet and, if you like, an auto cash-out. Tap Launch to start the countdown."], ar: ["١ · ضع رهانك", "حدد مبلغ اللعب، وإذا تريد حط سحب تلقائي، وبعدها اضغط «أطلق»."] , ru: ["1 · Сделайте ставку", "Укажите ставку и, по желанию, авто-вывод. Нажмите «Старт», чтобы запустить отсчёт."], hi: ["1 · बेट लगाएँ", "अपनी बेट तय करें और चाहें तो ऑटो कैश-आउट लगाएँ। काउंटडाउन शुरू करने के लिए लॉन्च दबाएँ।"] },
    { en: ["2 · Watch it climb", "The multiplier keeps rising while the rocket flies. Your payout is your bet times the multiplier."], ar: ["٢ · راقب الصعود", "الصاروخ يصعد والمضاعف يزيد. ربحك هو مبلغ اللعب × المضاعف."] , ru: ["2 · Следите за ростом", "Пока ракета летит, множитель растёт. Выплата = ставка × множитель."], hi: ["2 · ऊपर चढ़ते देखें", "रॉकेट उड़ता है तो मल्टीप्लायर बढ़ता है। आपका भुगतान = बेट × मल्टीप्लायर।"] },
    { en: ["3 · Cash out in time", "Cash out before the crash to keep your payout. If it crashes first, you lose the bet. The crash point is set before the round."], ar: ["٣ · اسحب في الوقت المناسب", "اسحب قبل الانهيار حتى تاخذ ربحك. إذا انهار أول، تخسر مبلغ اللعب. نقطة الانهيار تتحدد قبل الجولة."] , ru: ["3 · Заберите вовремя", "Заберите выигрыш до крэша. Если крэш случится раньше, ставка проиграна. Точка крэша определяется до раунда."], hi: ["3 · समय पर कैश आउट करें", "क्रैश से पहले कैश आउट करें तो भुगतान आपका। पहले क्रैश हुआ तो बेट हार जाती है। क्रैश पॉइंट राउंड से पहले तय होता है।"] },
  ],
  mines: [
    { en: ["1 · Pick your mines", "More bombs means more risk and a bigger multiplier for each gem. Set your bet and start."], ar: ["١ · اختر عدد القنابل", "قنابل أكثر يعني مخاطرة أكبر ومضاعف أعلى. حدد مبلغ اللعب وابدأ."] , ru: ["1 · Выберите число мин", "Больше бомб — выше риск и больше множитель за каждый кристалл. Задайте ставку и начинайте."], hi: ["1 · माइंस चुनें", "ज़्यादा बम यानी ज़्यादा जोखिम और हर जेम पर बड़ा मल्टीप्लायर। बेट तय करके शुरू करें।"] },
    { en: ["2 · Reveal tiles", "Tap a tile. Gems raise your multiplier; a bomb ends the round."], ar: ["٢ · اكشف المربعات", "اضغط على المربعات. الجوهرة ترفع المضاعف، والقنبلة تنهي الجولة."] , ru: ["2 · Открывайте плитки", "Нажимайте на плитки. Кристалл повышает множитель, бомба завершает раунд."], hi: ["2 · टाइल्स खोलें", "टाइल पर टैप करें। जेम मल्टीप्लायर बढ़ाता है, बम राउंड खत्म कर देता है।"] },
    { en: ["3 · Cash out any time", "After at least one gem you can cash out and keep stake × multiplier. Clear every gem for an automatic cash-out."], ar: ["٣ · اسحب متى شئت", "بعد ألماسة واحدة على الأقل يمكنك السحب والاحتفاظ بـ الرهان × المضاعف. إذا كشفت كل الألماس يتم السحب تلقائياً."] , ru: ["3 · Забирайте в любой момент", "После хотя бы одного кристалла можно забрать ставка × множитель. Если откроете все кристаллы, выплата произойдёт автоматически."], hi: ["3 · कभी भी कैश आउट करें", "कम से कम एक जेम के बाद आप कैश आउट करके बेट × मल्टीप्लायर रख सकते हैं। सारे जेम खुलने पर कैश-आउट अपने-आप हो जाता है।"] },
  ],
  dice: [
    { en: ["1 · Choose your odds", "Choose Under or Over and set your win chance. Lower chance means a higher multiplier."], ar: ["١ · اختر فرصتك", "اختار «أقل من» أو «أعلى من» وحدد فرصة الفوز. كلما قلت الفرصة زاد المضاعف."] , ru: ["1 · Выберите шансы", "Выберите «Меньше» или «Больше» и задайте шанс выигрыша. Чем ниже шанс, тем выше множитель."], hi: ["1 · अपने चांस चुनें", "नीचे या ऊपर चुनें और जीतने का चांस तय करें। चांस कम होगा तो मल्टीप्लायर ज़्यादा होगा।"] },
    { en: ["2 · Roll", "The roll is between 0.00 and 99.99. You win when it lands in the highlighted zone."], ar: ["٢ · ارمِ", "النتيجة من 0.00 إلى 99.99. إذا ظهر الرقم داخل المنطقة المحددة، تربح."] , ru: ["2 · Бросок", "Результат от 0.00 до 99.99. Вы выигрываете, если число попадает в выделенную зону."], hi: ["2 · रोल करें", "नतीजा 0.00 से 99.99 के बीच आता है। संख्या चुने गए ज़ोन में आए तो आप जीतते हैं।"] },
    { en: ["3 · Risk vs reward", "A lower chance pays more. The game has a 90% return over time."], ar: ["٣ · المخاطرة والمكافأة", "فرصة أقل تعني ربح أعلى. عائد اللعبة 90% على المدى الطويل."] , ru: ["3 · Риск и награда", "Чем ниже шанс, тем больше выплата. Возврат игры со временем — 90%."], hi: ["3 · जोखिम बनाम इनाम", "कम चांस पर ज़्यादा भुगतान मिलता है। लंबे समय में गेम का रिटर्न 90% है।"] },
  ],
  blackjack: [
    { en: ["1 · Get close to 21", "Get closer to 21 than the dealer without going over. Face cards count as 10; Ace counts as 1 or 11."], ar: ["١ · اقترب من 21", "جيب مجموع أعلى من الموزّع من دون ما تتجاوز 21. الصور = 10 والآص = 1 أو 11."] , ru: ["1 · Приблизьтесь к 21", "Наберите больше дилера, не превысив 21. Картинки = 10, туз = 1 или 11."], hi: ["1 · 21 के करीब पहुँचें", "21 से ऊपर गए बिना डीलर से ज़्यादा जोड़ बनाएँ। फेस कार्ड = 10, इक्का = 1 या 11।"] },
    { en: ["2 · Hit or stand", "Hit takes another card. Stand keeps your hand and lets the dealer play. The dealer draws to 17."], ar: ["٢ · سحب أو تثبيت", "«سحب» يجيبلك ورقة. «ثبّت» يخلي دور الموزّع. هو يسحب لحد 17."] , ru: ["2 · Ещё или хватит", "«Ещё» — взять карту. «Хватит» — оставить руку, ход дилера. Дилер берёт до 17."], hi: ["2 · हिट या स्टैंड", "हिट से एक और पत्ता मिलता है। स्टैंड से आपका हाथ रुकता है और डीलर खेलता है। डीलर 17 तक पत्ते लेता है।"] },
    { en: ["3 · Rules", "Blackjack pays 6:5. Over 21 loses; a tie goes to the dealer."], ar: ["٣ · القواعد", "بلاك جاك يدفع 6:5. إذا تتجاوز 21 تخسر، والتعادل للموزّع."] , ru: ["3 · Правила", "Блэкджек платит 6:5. Перебор проигрывает; при ничьей выигрывает дилер."], hi: ["3 · नियम", "ब्लैकजैक 6:5 देता है। 21 से ऊपर जाने पर हार; बराबरी पर डीलर जीतता है।"] },
  ],
};

const seenKey = (g: GameId) => `oddxs.howto.${g}`;
const memSeen = new Set<string>();
export const hasSeenHowTo = (g: GameId) => { try { return localStorage.getItem(seenKey(g)) === "1"; } catch { return memSeen.has(g); } };
const markSeen = (g: GameId) => { memSeen.add(g); try { localStorage.setItem(seenKey(g), "1"); } catch { /* */ } };

export function HowTo({ game, open, onClose }: { game: GameId; open: boolean; onClose: () => void }) {
  const lang = useLang(); const tx = useTx();
  const steps = TEXT[game];
  useEffect(() => { if (open) markSeen(game); }, [open, game]);
  return (
    <Sheet open={open} onClose={onClose}>
      <ol className="howto">
        {steps.map((s, i) => <li key={i}><b>{(s[lang] ?? s.en)[0]}</b><p>{(s[lang] ?? s.en)[1]}</p></li>)}
      </ol>
      <button type="button" className="btn btn-acc" onClick={() => { sfx.click(); onClose(); }}>{tx("فهمت", "Got it", "Понятно", "समझ गया")}</button>
    </Sheet>
  );
}
