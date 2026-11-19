export type GameTone = "blue" | "green" | "purple" | "gold";

export type GameCardProps = {
  /** Wide promo art (840x473, ~16:9). The art already contains the title + tagline, so no text is overlaid. */
  imageSrc: string;
  /** Accessible name. The art's text is baked into pixels, so screen readers need this. */
  label?: string;
  /** Drives the faint hover/touch glow colour (blue = Crash, green = Mines, purple = Dice, gold = Blackjack). */
  tone?: GameTone;
  onClick?: () => void;
  className?: string;
};

/**
 * Edge-to-edge image card.
 * - Card box = the art's own ratio (840/473), so `object-cover` fills it completely with zero bars and
 *   (because box ratio == image ratio) crops nothing: the baked-in title text stays fully visible.
 * - Own boxed container: full width of the page content (~92% of the screen, 16px side margins from `.app-main`), 14px radius,
 *   `overflow-hidden`, a single crisp 1px blue border (#229ED9 @ .6). No shadow / glow.
 * - Press/hover/focus (index.css) makes the border solid #229ED9. The shimmer lives inside the padding box, so it sits over the image but under the border.
 * - Bottom gradient overlay (span) for depth; `.gcard::after` (index.css) is the synchronized shimmer.
 */
export default function GameCard({ imageSrc, label, tone = "blue", onClick, className = "" }: GameCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-tone={tone}
      className={`gcard group relative block w-full aspect-[840/473] overflow-hidden rounded-[14px] bg-[#0A0A0A] p-0 select-none cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#229ED9] ${className}`}
    >
      <img
        src={imageSrc}
        alt=""
        width={840}
        height={473}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover object-center pointer-events-none"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(to_top,rgba(0,0,0,0.7)_0%,transparent_50%)]" />
    </button>
  );
}
