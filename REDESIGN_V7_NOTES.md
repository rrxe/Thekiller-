# ODDXS V7 redesign (premium dark)

Visual layer only. Server, SQL, API, game maths and store logic are unchanged.

## Design system (src/index.css)
- Base #0B0B0F, cards #14151C, accent #229ED9, win #2ECC71, loss #E74C3C, secondary text #A0A0AB.
- Glow only on: Crash multiplier, Crash curve, Cash Out button, active nav icon.
- Weights 400/600/800, tabular numbers for balances and multipliers.

## Navigation
Home / Games / Wallet / Profile. Tasks, Referrals, Exchange and Bet history are sub-screens
(Home links, Profile links, Wallet button) and highlight their parent tab.

## Screens
- Home: banner carousel (welcome / watch-ad reward / invite), Quick Games, Trending carousel, Recent Bets, streak + chest.
- Games: category chips, Popular Games gradient cards, Recent Bets.
- Crash / Mines / Dice / Blackjack: `.game-screen` is a flex column (header, game area `flex:1`, fixed `.dock`).
  Verified at 390x844: scrollHeight === clientHeight, dock bottom === viewport bottom.
- Crash: colored history pills, glowing blue-violet curve + rocket sprite, dock = bet row, cash-out-at row, one big button.

## Art
public/images/art: crash.webp, dice.webp, hero.webp (from the supplied screenshots), mines.svg, blackjack.svg.

## Notes
- "Deposit" in the mockups is "Earn" here (the app has no deposits; it earns points via ads/tasks).
- Plinko is not in this app, so Blackjack takes its slot.
- Install and build as before: `npm install && npm run typecheck && npm run build`.
