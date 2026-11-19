# ODDXS V11 — image game cards
- New: src/components/GameCard.tsx (`<GameCard imageSrc label onClick />`), Tailwind only.
- Art: public/images/games/{crash,mines,dice,blackjack}.webp (840x473, converted from the 1672x941 PNGs, ~50KB each).
- src/lib/games.ts: new `banner` field per game. src/screens/Games.tsx: "Popular games" grid now renders GameCard.
- No-crop guarantee: `object-contain` + card `aspect-[1672/941]` (the art's own ratio) + `#0A0A0A` backing.
- Old `.pop*` CSS is now unused on the Games screen and can be deleted. Home "Quick games" is unchanged.
