# ODDXS V9 (premium banner + Crash game)
Files: src/screens/Home.tsx (banner markup), src/games/Crash.tsx, src/lib/crashScene.ts, src/index.css (appended "V9 premium" block).

Banner
- Layered slides: per-slide accent glow, fine masked grid, glass top edge, slow light sweep, hero art faded on two edges.
- Eyebrow label, glass reward pill with coin, CTA with a slow sheen.
- Pagination: active dot is a progress bar that matches the 5.5s autoplay; dots are tappable; RTL-safe index.

Crash
- Scene: parallax starfield, horizon glow, dashed grid, gradient curve + area fade, rocket exhaust trail, launch-pad idle/shake in countdown,
  cash-out marker left on the curve, short ring + particle burst on crash. Respects prefers-reduced-motion.
- UI: status pill, multiplier tiers (blue < 2x, violet 2x+, light violet 10x+), countdown ring, tinted history chips that slide in,
  glass dock (~169px, no scroll), BET button with sheen, CASH OUT button with payout + live multiplier and a soft pulse.
