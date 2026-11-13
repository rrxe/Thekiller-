# ODDXS V12 — Games tab: full-width banners + shimmer
- Games.tsx: removed the category row (Crash/Mines/Dice/Blackjack chips) and the filter state; only a standalone "All Games" pill remains. Banners render in a single-column `.game-list` (16px gap; 16px side padding comes from `.app-main`).
- GameCard.tsx: new `tone` + `index` props. Still `object-contain` + `aspect-[1672/941]` so the baked-in text is never cropped.
- index.css: `.gcard::after` = diagonal white shimmer (peak alpha .14, 7s loop, staggered per card, disabled with prefers-reduced-motion); hover/touch/focus glow uses a ~.18 alpha box-shadow in the game's tone (blue/green/purple/gold). Old `.cat*` / `.pop-grid` rules removed. Bottom nav untouched.

## V12.1 — compact banners + synchronized shimmer
- Cards: `w-[88%] mx-auto aspect-[2.5/1]`, radius 14px, border rgba(255,255,255,.05), `object-contain` (no cropping). List gap 20px.
- Shimmer: single `@keyframes shimmerSweep`, 4s, delay 0s on every card (synchronized); 105deg gradient peaking at rgba(255,255,255,.15); sweeps in the first ~45% of the cycle, then pauses. Per-card stagger (`index` prop) removed.
- Hover/touch: scale(.98) + faint themed glow. "All Games" pill, top/bottom nav unchanged.

## V12.2 — edge-to-edge premium cards
- Card: `w-[90%] mx-auto aspect-[840/473] rounded-2xl overflow-hidden border-white/10`; image `object-cover` (box ratio == art ratio => no bars, no text cropped).
- Bottom gradient overlay `linear-gradient(to top, rgba(0,0,0,.7) 0%, transparent 50%)` (z-1); shimmer `::after` stays synchronized (z-2, 4s, 0s delay).
- Press: scale(.97). List gap 16px.

## V12.3 — blue boxed cards
- Each card: `border-[1.5px] rgba(34,158,217,.4)`, `shadow 0 4px 12px rgba(34,158,217,.1)`, radius 16px, overflow hidden, full width of `.game-list` (`padding: 0 16px`, `gap: 20px`).
- Press/hover/focus: border -> rgba(34,158,217,.8), slightly stronger blue shadow, scale(.97) on press.
- Shimmer unchanged (synchronized); it renders inside the padding box so it is over the image and under the border. Per-game tone glow removed in favour of the single blue accent.

## V12.4 — thin blue border, no glow
- Card: `border 1px rgba(34,158,217,.6)`, radius 14px, no box-shadow anywhere. Press/hover/focus -> border rgba(34,158,217,1); press scale .97.
- `.game-list`: gap 24px, no extra padding (cards = full `.app-main` content width, ~91-92% of a phone screen).
- Shimmer unchanged (synchronized, under the border).

## V12.5 — border actually renders
- Root cause: global unlayered `button { border: 0 }` in index.css beat Tailwind v4's layered `border` utilities, so the card border never showed.
- Fix: `border: 1px solid rgba(34,158,217,.6)`, `border-radius: 14px`, `box-shadow: none` now live in `.gcard` (index.css). Hover/active/focus -> rgba(34,158,217,1) (unchanged).
- `.game-list`: `width: 92%; margin-inline: auto; gap: 24px`.

## V12.6 — Home cleanup
- Removed the Quick Games section (2x2 grid) from Home.tsx and its CSS.
- Trending Games: horizontal snap row of 150px square cards (aspect 1/1, radius 16px, gap 12px), `object-fit: cover` on the supplied square art (480x480 webp, `/images/games/<id>-square.webp`, new `square` field in games.ts). No border/shadow/badges/overlay; press = scale .97 only.

