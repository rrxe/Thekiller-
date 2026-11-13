// Thin wrapper over Telegram.WebApp — every call is optional so the app also runs in a normal browser.
type TG = any;
const tg = (): TG | undefined => (window as any).Telegram?.WebApp;

export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.setHeaderColor?.("#111111");
    w.setBackgroundColor?.("#111111");
    w.setBottomBarColor?.("#111111");
    // Games are played with the thumb: stop swipe-down from closing the Mini App mid-round.
    w.disableVerticalSwipes?.();
  } catch { /* old clients */ }
}

export const initData = () => tg()?.initData || "";
export const tgUserId = () => tg()?.initDataUnsafe?.user?.id as number | undefined;

type Impact = "light" | "medium" | "heavy" | "rigid" | "soft";
export const haptic = {
  tap: (s: Impact = "light") => { try { tg()?.HapticFeedback?.impactOccurred(s); } catch { /* */ } },
  win: () => { try { tg()?.HapticFeedback?.notificationOccurred("success"); } catch { /* */ } },
  lose: () => { try { tg()?.HapticFeedback?.notificationOccurred("error"); } catch { /* */ } },
  tick: () => { try { tg()?.HapticFeedback?.selectionChanged(); } catch { /* */ } },
};

let backCb: (() => void) | null = null;
/** Native Telegram back button (shown while a game is open). */
export function setBackButton(show: boolean, cb?: () => void) {
  const b = tg()?.BackButton;
  if (!b) return;
  try {
    if (backCb) b.offClick(backCb);
    backCb = cb ?? null;
    if (show && cb) { b.onClick(cb); b.show(); } else b.hide();
  } catch { /* */ }
}
