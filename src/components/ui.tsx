import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { tweenNumber } from "../lib/fx";
import { haptic } from "../lib/telegram";
import { useLang, useT } from "../lib/i18n";
import { clamp } from "../lib/format";
import { DEFAULT_SETTINGS, useStore } from "../lib/store";
import { isMuted, onMuteChange, setMuted, sfx } from "../lib/sfx";
import { useToast } from "../lib/toast";
import { HowTo } from "./HowTo";
import type { GameId } from "../../shared/game-service";

/* ───────── numbers ───────── */

/** Animated number (150ms ease-out). Writes straight to the DOM node, no per-frame React renders. */
export function CountUp({ value, decimals = 2, duration = 0.15, prefix = "", suffix = "", className = "" }: {
  value: number; decimals?: number; duration?: number; prefix?: string; suffix?: string; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const cur = useRef(value);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const t = tweenNumber(cur.current, value, duration, (v) => {
      cur.current = v;
      el.textContent = prefix + v.toFixed(decimals) + suffix;
    });
    return () => { t.kill(); cur.current = value; el.textContent = prefix + value.toFixed(decimals) + suffix; };
  }, [value, decimals, duration, prefix, suffix]);
  return <span ref={ref} className={`num ${className}`}>{prefix + cur.current.toFixed(decimals) + suffix}</span>;
}

/* ───────── buttons / inputs ───────── */

export function Btn({ children, onClick, variant = "acc", disabled, className = "", big }: {
  children: ReactNode; onClick?: () => void; variant?: "acc" | "ghost" | "win"; disabled?: boolean; className?: string; big?: boolean;
}) {
  return (
    <button type="button" disabled={disabled} onClick={() => { haptic.tap("light"); sfx.click(); onClick?.(); }}
      className={`btn btn-${variant} ${big ? "btn-lg" : ""} ${className}`}>
      {children}
    </button>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`switch ${on ? "is-on" : ""}`}
      onClick={() => { haptic.tick(); sfx.tick(); onChange(!on); }}>
      <i aria-hidden="true" /><span>{label}</span>
    </button>
  );
}

/** Bet amount: input + ½ + 2× + MAX in ONE row (no scroll, no dropdowns). Limits come from admin settings. */
export function BetControls({ stake, setStake, balancePts, disabled }: {
  stake: number; setStake: (n: number) => void; balancePts: number; disabled?: boolean;
}) {
  const t = useT();
  const cfg = useStore().settings ?? DEFAULT_SETTINGS;
  const min = cfg.min_bet_pts, max = cfg.max_bet_pts;
  const cap = Math.max(min, Math.min(max, Math.floor(balancePts * 100) / 100));
  const set = (n: number) => { haptic.tick(); sfx.tick(); setStake(clamp(Math.round(n * 100) / 100, min, cap)); };
  return (
    <div className={`bet ${disabled ? "is-disabled" : ""}`}>
      <div className="bet-row" dir="ltr">
        <label className="bet-input">
          <input disabled={disabled} aria-label={t("stake")} inputMode="decimal" className="input num" value={stake}
            onChange={(e) => { const v = parseFloat(e.target.value.replace(",", ".")); setStake(Number.isFinite(v) ? Math.max(0, v) : 0); }}
            onBlur={() => set(stake || min)} />
          <span>PTS</span>
        </label>
        <button type="button" className="sq" disabled={disabled} onClick={() => set(stake / 2)}>½</button>
        <button type="button" className="sq" disabled={disabled} onClick={() => set(stake * 2)}>2×</button>
        <button type="button" className="sq" disabled={disabled} onClick={() => set(balancePts)}>MAX</button>
      </div>
    </div>
  );
}

/** One-line result strip (win / loss / push). */
export function ResultLine({ kind, amount, label }: { kind: "win" | "lose" | "push"; amount: number; label: string }) {
  const t = useT();
  return (
    <div className={`result-line is-${kind}`} role="status">
      <span>{label}</span>
      <b className="num">{kind === "win" ? "+" : kind === "lose" ? "−" : ""}{amount.toFixed(2)} {t("points")}</b>
    </div>
  );
}

export function GameHeader({ game, title, rtp, onBack }: { game: GameId; title: string; rtp: string; onBack: () => void }) {
  const t = useT();
  const [how, setHow] = useState(false);
  return (
    <div className="game-head">
      <button type="button" onClick={() => { sfx.click(); onBack(); }} aria-label={t("back")} className="icon-btn rtl-flip"><Icon name="back" size={20} /></button>
      <h2>{title}</h2>
      <span className="game-rtp num">RTP {rtp}</span>
      <button type="button" onClick={() => { sfx.click(); setHow(true); }} aria-label={t("howTo")} className="icon-btn"><Icon name="help" size={20} /></button>
      <HowTo game={game} open={how} onClose={() => setHow(false)} />
    </div>
  );
}

/* ───────── icons (24px stroke) ───────── */
const P: Record<string, ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  exchange: <><path d="M4 7h14l-3-3" /><path d="M18 7l-3 3" /><path d="M20 17H6l3 3" /><path d="M6 17l3-3" /></>,
  wallet: <><path d="M3 7a2 2 0 012-2h13v4" /><rect x="3" y="7" width="18" height="13" rx="3" /><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5L16 9.5" /></>,
  play: <path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor" />,
  rocket: <><path d="M12 3c3 2 5 5 5 9l-2 4H9l-2-4c0-4 2-7 5-9z" /><circle cx="12" cy="10" r="1.6" /><path d="M9 16l-2 4M15 16l2 4M12 17v4" /></>,
  gem: <><path d="M6 4h12l3 5-9 11L3 9l3-5z" /><path d="M3 9h18M9 4l-1 5 4 11 4-11-1-5" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.3" fill="currentColor" /><circle cx="15" cy="15" r="1.3" fill="currentColor" /><circle cx="15" cy="9" r="1.3" fill="currentColor" /><circle cx="9" cy="15" r="1.3" fill="currentColor" /></>,
  cards: <><rect x="4" y="5" width="11" height="15" rx="2.5" /><path d="M9 3.5l9.5 2.5a2 2 0 011.4 2.4l-2.5 10" /></>,
  fire: <path d="M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />,
  gift: <><rect x="3" y="9" width="18" height="11" rx="2" /><path d="M3 13h18M12 9v11M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c.7-3.5 3.2-5.3 7.5-5.3s6.8 1.8 7.5 5.3" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M2.8 19c.5-2.8 2.5-4.2 6.2-4.2s5.7 1.4 6.2 4.2" /><path d="M16 5.3a3 3 0 010 5.8M17 14.8c2.5.3 3.9 1.7 4.3 4.2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  tasks: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  bolt: <path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" fill="currentColor" />,
  volume: <><path d="M4 9.5v5h4l5 4v-13l-5 4H4z" /><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /></>,
  mute: <><path d="M4 9.5v5h4l5 4v-13l-5 4H4z" /><path d="M17 9.5l4 5M21 9.5l-4 5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  link: <><path d="M10 13a5 5 0 007.1 0l2-2a5 5 0 00-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 00-7.1 0l-2 2A5 5 0 0012 20l1.1-1.1" /></>,
  send: <><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4 18-7z" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  "arrow-up-right": <path d="M7 17 17 7M7 7h10v10" />,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  pause: <path d="M8 5v14M16 5v14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.2M12 17h.01" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 102.5-6" /><path d="M3.5 4.5v4h4" /><path d="M12 8v4.5l3 1.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  gamepad: <><path d="M7 8h10a4 4 0 014 4v2.5a2.5 2.5 0 01-4.3 1.7L15 14.5H9l-1.7 1.7A2.5 2.5 0 013 14.5V12a4 4 0 014-4z" /><path d="M8 10.5v3M6.5 12h3" /><circle cx="15.5" cy="11.2" r=".8" fill="currentColor" /><circle cx="17.5" cy="12.8" r=".8" fill="currentColor" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 01-8 0V4z" /><path d="M8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4M8.5 20h7M10 17h4" /></>,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor" />,
  flame: <path d="M12 3c.8 3.2 5 5 5 10a5 5 0 01-10 0c0-2 1-3.2 2-4.2 0 2 1 3 2 3 0-3-1.2-5 1-8.8z" fill="currentColor" />,
};
/** Round points coin used next to balances and bet amounts. */
export const Coin = ({ size = 18 }: { size?: number }) => <span className="coin" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">P</span>;
export function Icon({ name, size = 22, className = "" }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {P[name]}
    </svg>
  );
}

/** Bottom sheet: max 70vh, 14px top radius, drag-handle affordance. Tap the dim layer to close. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}

/** Sound toggle (sound is synthesised, so this just mutes the master gain). */
export function MuteButton({ className = "" }: { className?: string }) {
  const m = useSyncExternalStore(onMuteChange, isMuted);
  const t = useT();
  return (
    <button type="button" onClick={() => { setMuted(!m); if (m) sfx.click(); }} aria-label={t("mute")} aria-pressed={m}
      className={`icon-btn ${m ? "" : "is-on"} ${className}`}>
      <Icon name={m ? "mute" : "volume"} size={20} />
    </button>
  );
}

/** Bottom toast: dark #1A1A1A, 1px border, 11px radius, 2s. */
export function Toaster() {
  const tt = useToast();
  if (!tt) return null;
  return <div key={tt.id} className="toast" role="status">{tt.text}</div>;
}

/** Thin 2px accent line at the very top while loading. */
export const LoadLine = () => <div className="load-line" role="progressbar" aria-label="Loading" />;

export const useIsAr = () => useLang() === "ar";
