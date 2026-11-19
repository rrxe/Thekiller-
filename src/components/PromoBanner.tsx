import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./ui";

export type PromoBannerProps = {
  /** Full-cover background (character art). Rendered as a CSS background, never an <img>. */
  backgroundImage: string;
  title: ReactNode;
  /** Optional third line under the title (e.g. a tagline). */
  description?: string;
  /** Extra class for per-banner background tweaks, e.g. "promo-welcome". */
  className?: string;
  subtitle?: string;
  buttonText: string;
  /** Optional reward pill under the title, e.g. <Coin/> +1.00 */
  reward?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
};

export default function PromoBanner({ backgroundImage, title, description, className, subtitle, buttonText, reward, onClick, disabled, ariaLabel }: PromoBannerProps) {
  const style = { "--promo-img": `url("${backgroundImage}")` } as CSSProperties;
  return <article className={`promo${className ? " " + className : ""}`} style={style} aria-label={ariaLabel}>
    <div className="promo-copy">
      {subtitle && <p className="promo-sub">{subtitle}</p>}
      <h3 className="promo-title">{title}</h3>
      {description && <p className="promo-desc">{description}</p>}
      {reward && <span className="promo-reward num" dir="ltr">{reward}</span>}
      <button type="button" className="promo-cta" disabled={disabled} onClick={onClick}>
        <span>{buttonText}</span><Icon name="chevron" size={16} className="rtl-flip" />
      </button>
    </div>
  </article>;
}
