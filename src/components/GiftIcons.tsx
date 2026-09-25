type GiftIconProps = { className?: string };

export function RoseIcon({ className = "" }: GiftIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 21h8" stroke="#5a8f4a" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 21V11" stroke="#5a8f4a" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 14c-2 1-4 0-4.5-1.6" stroke="#5a8f4a" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path
        d="M12 3c2.6 0 4.6 1.7 4.6 4 0 2.6-2.2 4.4-4.6 5.6-2.4-1.2-4.6-3-4.6-5.6C7.4 4.7 9.4 3 12 3Z"
        fill="#e0334d"
      />
      <path
        d="M12 5c1.4 0 2.5.9 2.5 2.1 0 1.5-1.3 2.6-2.5 3.3-1.2-.7-2.5-1.8-2.5-3.3C9.5 5.9 10.6 5 12 5Z"
        fill="#ff5c72"
      />
    </svg>
  );
}

export function CakeIcon({ className = "" }: GiftIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="12" width="14" height="8" rx="1.6" fill="#f4e3c1" />
      <rect x="5" y="12" width="14" height="3" fill="#e0334d" opacity="0.6" />
      <rect x="7.3" y="7.5" width="1.4" height="4.5" fill="#f4e3c1" />
      <rect x="11.3" y="7.5" width="1.4" height="4.5" fill="#f4e3c1" />
      <rect x="15.3" y="7.5" width="1.4" height="4.5" fill="#f4e3c1" />
      <circle cx="8" cy="6.5" r="1" fill="#ffcf4d" />
      <circle cx="12" cy="6.5" r="1" fill="#ffcf4d" />
      <circle cx="16" cy="6.5" r="1" fill="#ffcf4d" />
    </svg>
  );
}

export function RingIcon({ className = "" }: GiftIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="15" r="5.4" fill="none" stroke="#c7d0da" strokeWidth="2" />
      <path d="M12 5.5 9.6 9.5h4.8L12 5.5Z" fill="#bfe4ff" />
      <path d="M9.6 9.5h4.8l-2.4 2.6-2.4-2.6Z" fill="#7fd0ff" />
    </svg>
  );
}

export function DiamondIcon({ className = "" }: GiftIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 9 12 4l7 5-7 11L5 9Z" fill="#7fd0ff" />
      <path d="M5 9h14l-7 11L5 9Z" fill="#4fb4ea" />
      <path d="M9 9 12 4l3 5H9Z" fill="#bfe9ff" />
    </svg>
  );
}

export function TrophyGiftIcon({ className = "" }: GiftIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" fill="#ffcf4d" />
      <path
        d="M7 5.2c-1.8 0-3.2 1.2-3.2 3S5.2 11 7 11"
        stroke="#b8860b"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M17 5.2c1.8 0 3.2 1.2 3.2 3S18.8 11 17 11"
        stroke="#b8860b"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="10.5" y="12.5" width="3" height="3" fill="#b8860b" />
      <rect x="8.5" y="16" width="7" height="2" rx="0.6" fill="#b8860b" />
    </svg>
  );
}

export function RocketGiftIcon({ className = "" }: GiftIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2c2.6 2 4 5.4 4 9 0 2-1 4-1 4H9s-1-2-1-4c0-3.6 1.4-7 4-9Z" fill="#dfe6ee" />
      <circle cx="12" cy="9" r="1.6" fill="#4fb4ea" />
      <path d="M9 15 6.5 19h3L12 16l2.5 3h3L15 15" fill="#e0334d" />
      <path d="M11 16.5c0 1.6.5 3 1 4 .5-1 1-2.4 1-4" fill="#ff9a4d" />
    </svg>
  );
}

export function ChampagneGiftIcon({ className = "" }: GiftIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M10.5 3h3l.4 6-1.9 2-1.9-2 .4-6Z" fill="#c7d0da" />
      <path d="M10.9 9 9 12v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-8l-1.9-3Z" fill="#5a8f4a" />
      <circle cx="7" cy="8" r="0.8" fill="#f4e3c1" />
      <circle cx="16.5" cy="9.5" r="0.6" fill="#f4e3c1" />
      <circle cx="15.5" cy="6.5" r="0.6" fill="#f4e3c1" />
    </svg>
  );
}

const GIFT_ICON_COMPONENTS = [
  RoseIcon,
  CakeIcon,
  RingIcon,
  DiamondIcon,
  TrophyGiftIcon,
  RocketGiftIcon,
  ChampagneGiftIcon,
];

export function GiftField({ count = 12 }: { count?: number }) {
  return (
    <div className="stars-gift-field" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const Icon = GIFT_ICON_COMPONENTS[i % GIFT_ICON_COMPONENTS.length];
        const size = 16 + (i % 4) * 3;
        const left = (i * 8.6 + (i % 5) * 11) % 100;
        const top = (i * 13.7 + (i % 7) * 9) % 100;
        const gx = ((i * 23) % 30) - 15;
        const gy = ((i * 31) % 30) - 15;
        const gr = ((i * 17) % 24) - 12;

        return (
          <span
            key={i}
            className="stars-gift-icon"
            style={
              {
                left: `${left}%`,
                top: `${top}%`,
                width: size,
                height: size,
                opacity: 0.16 + (i % 5) * 0.05,
                animationDelay: `${(i % 10) * 0.6}s`,
                animationDuration: `${16 + (i % 6) * 2.2}s`,
                "--gx": `${gx}px`,
                "--gy": `${gy}px`,
                "--gr": `${gr}deg`,
              } as React.CSSProperties
            }
          >
            <Icon className="stars-gift-icon-svg" />
          </span>
        );
      })}
    </div>
  );
}
