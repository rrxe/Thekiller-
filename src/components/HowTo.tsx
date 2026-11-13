// How-to-play sheet: plain text steps (bilingual), no illustrations.
import { useEffect } from "react";
import { useLang } from "../lib/i18n";
import { Sheet } from "./ui";
import { sfx } from "../lib/sfx";
import type { GameId } from "../../shared/game-service";

type Step = { en: [string, string]; ar: [string, string] };

const TEXT: Record<GameId, Step[]> = {
  crash: [
    { en: ["1 · Place your bet", "Set your bet and, if you like, an auto cash-out. Tap Launch to start the countdown."], ar: ["١ · ضع رهانك", "حدد مبلغ اللعب، وإذا تريد حط سحب تلقائي، وبعدها اضغط «أطلق»."] },
    { en: ["2 · Watch it climb", "The multiplier keeps rising while the rocket flies. Your payout is your bet times the multiplier."], ar: ["٢ · راقب الصعود", "الصاروخ يصعد والمضاعف يزيد. ربحك هو مبلغ اللعب × المضاعف."] },
    { en: ["3 · Cash out in time", "Cash out before the crash to keep your payout. If it crashes first, you lose the bet. The crash point is set before the round."], ar: ["٣ · اسحب في الوقت المناسب", "اسحب قبل الانهيار حتى تاخذ ربحك. إذا انهار أول، تخسر مبلغ اللعب. نقطة الانهيار تتحدد قبل الجولة."] },
  ],
  mines: [
    { en: ["1 · Pick your mines", "More bombs means more risk and a bigger multiplier for each gem. Set your bet and start."], ar: ["١ · اختر عدد القنابل", "قنابل أكثر يعني مخاطرة أكبر ومضاعف أعلى. حدد مبلغ اللعب وابدأ."] },
    { en: ["2 · Reveal tiles", "Tap a tile. Gems raise your multiplier; a bomb ends the round."], ar: ["٢ · اكشف المربعات", "اضغط على المربعات. الجوهرة ترفع المضاعف، والقنبلة تنهي الجولة."] },
    { en: ["3 · Cash out any time", "After at least one gem you can cash out and keep stake × multiplier. Clear every gem for an automatic cash-out."], ar: ["٣ · اسحب متى شئت", "بعد ألماسة واحدة على الأقل يمكنك السحب والاحتفاظ بـ الرهان × المضاعف. إذا كشفت كل الألماس يتم السحب تلقائياً."] },
  ],
  dice: [
    { en: ["1 · Choose your odds", "Choose Under or Over and set your win chance. Lower chance means a higher multiplier."], ar: ["١ · اختر فرصتك", "اختار «أقل من» أو «أعلى من» وحدد فرصة الفوز. كلما قلت الفرصة زاد المضاعف."] },
    { en: ["2 · Roll", "The roll is between 0.00 and 99.99. You win when it lands in the highlighted zone."], ar: ["٢ · ارمِ", "النتيجة من 0.00 إلى 99.99. إذا ظهر الرقم داخل المنطقة المحددة، تربح."] },
    { en: ["3 · Risk vs reward", "A lower chance pays more. The game has a 90% return over time."], ar: ["٣ · المخاطرة والمكافأة", "فرصة أقل تعني ربح أعلى. عائد اللعبة 90% على المدى الطويل."] },
  ],
  blackjack: [
    { en: ["1 · Get close to 21", "Get closer to 21 than the dealer without going over. Face cards count as 10; Ace counts as 1 or 11."], ar: ["١ · اقترب من 21", "جيب مجموع أعلى من الموزّع من دون ما تتجاوز 21. الصور = 10 والآص = 1 أو 11."] },
    { en: ["2 · Hit or stand", "Hit takes another card. Stand keeps your hand and lets the dealer play. The dealer draws to 17."], ar: ["٢ · سحب أو تثبيت", "«سحب» يجيبلك ورقة. «ثبّت» يخلي دور الموزّع. هو يسحب لحد 17."] },
    { en: ["3 · Rules", "Blackjack pays 6:5. Over 21 loses; a tie goes to the dealer."], ar: ["٣ · القواعد", "بلاك جاك يدفع 6:5. إذا تتجاوز 21 تخسر، والتعادل للموزّع."] },
  ],
};

const seenKey = (g: GameId) => `oddxs.howto.${g}`;
const memSeen = new Set<string>();
export const hasSeenHowTo = (g: GameId) => { try { return localStorage.getItem(seenKey(g)) === "1"; } catch { return memSeen.has(g); } };
const markSeen = (g: GameId) => { memSeen.add(g); try { localStorage.setItem(seenKey(g), "1"); } catch { /* */ } };

export function HowTo({ game, open, onClose }: { game: GameId; open: boolean; onClose: () => void }) {
  const lang = useLang();
  const steps = TEXT[game];
  useEffect(() => { if (open) markSeen(game); }, [open, game]);
  return (
    <Sheet open={open} onClose={onClose}>
      <ol className="howto">
        {steps.map((s, i) => <li key={i}><b>{s[lang][0]}</b><p>{s[lang][1]}</p></li>)}
      </ol>
      <button type="button" className="btn btn-acc" onClick={() => { sfx.click(); onClose(); }}>{lang === "ar" ? "فهمت" : "Got it"}</button>
    </Sheet>
  );
}
