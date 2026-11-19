# ODDXS V18 — TopBar + Referrals + Wallet
- Shell.tsx: new TopBar (logo + current section label, points chip, USDT chip, round Earn button). Takes `tab` prop.
- App.tsx: `<TopBar tab={game ? "games" : tab} />`
- Referrals.tsx: page header, 2 stat cards, invite card (link + copy icon + share), steps timeline, leaderboard.
- Wallet.tsx: header, balance hero card (PTS/USDT), unlock-progress card, rules rows, filter chips + activity cards. Withdraw sheet/logic unchanged.
- i18n.ts: new keys refKicker, wkKicker, unlockProgress, payoutRules, refNeeds, pointsBal (ar + en).
- index.css: V18 block appended at the end (overrides old .topbar/.top-balance).
- LoadingScreen.tsx: new animated splash (aurora, grid, orbits, crystal X, staged progress); min display 1.4s in App.tsx
- Start button fix: telegram.js buildMiniAppLink now defaults short name to 'odx' -> https://t.me/ODDXS_BOT/odx?startapp=<payload> (opens Mini App inside Telegram). .env.example: BOT_USERNAME=ODDXS_BOT, BOT_APP_SHORT_NAME=odx
- public/admin.html: admin panel rewritten SLY-style (home with alert + quick stats + section grid, back button, help text per page, card lists instead of wide tables, collapsible settings + sticky save). API/actions unchanged.
