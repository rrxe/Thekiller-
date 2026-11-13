// ../../../../../../home/claude/oddxs/shared/engine.ts
var RTP = 0.9;
var MAX_CRASH = 1e6;
var enc = new TextEncoder();
var subtle = globalThis.crypto.subtle;
var toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(text) {
  return toHex(await subtle.digest("SHA-256", enc.encode(text)));
}
async function hmac(key, msg) {
  const k = await subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, enc.encode(msg)));
}
async function makeRng(serverSeed, clientSeed, nonce) {
  const blocks = [];
  for (let i = 0; i < 8; i++) blocks.push(await hmac(serverSeed, `${clientSeed}:${nonce}:${i}`));
  const bytes = new Uint8Array(256);
  blocks.forEach((b, i) => bytes.set(b, i * 32));
  let c = 0;
  const hex0 = [...blocks[0].slice(0, 7)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const u52 = parseInt(hex0.slice(0, 13), 16) / 2 ** 52;
  return {
    u52,
    next() {
      if (c + 4 > bytes.length) throw new Error("rng exhausted");
      const v = bytes[c] / 256 + bytes[c + 1] / 65536 + bytes[c + 2] / 16777216 + bytes[c + 3] / 4294967296;
      c += 4;
      return v;
    }
  };
}
var payoutFromCp = (stakeCp, mult) => Math.floor(stakeCp * mult + 1e-9);
function crashPoint(rng) {
  const p = Math.floor(100 * RTP / (1 - rng.u52)) / 100;
  return Math.min(MAX_CRASH, Math.max(1, p));
}
var CRASH_GROWTH = 0.12;
var crashMultAt = (tSec) => Math.exp(CRASH_GROWTH * tSec);
var crashTimeAt = (mult) => Math.log(mult) / CRASH_GROWTH;
var MINES_CELLS = 25;
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}
function minesMult(mines, picks) {
  if (picks <= 0) return 1;
  const m = RTP * comb(MINES_CELLS, picks) / comb(MINES_CELLS - mines, picks);
  return Math.floor(m * 100) / 100;
}
function minesLayout(rng, mines) {
  const idx = Array.from({ length: MINES_CELLS }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const board = new Array(MINES_CELLS).fill(false);
  for (let i = 0; i < mines; i++) board[idx[i]] = true;
  return board;
}
var DICE_MIN_CHANCE = 2;
var DICE_MAX_CHANCE = 95;
var diceMult = (chancePct) => Math.floor(RTP * 100 / chancePct * 1e4) / 1e4;
var diceRoll = (rng) => Math.floor(rng.next() * 1e4) / 100;
function diceWins(roll, mode, chancePct) {
  return mode === "under" ? roll < chancePct : roll >= 100 - chancePct;
}
var BJ_BLACKJACK_PAYS = 1.2;
var BJ_TIE_LOSES = true;
function shuffledDeck(rng) {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 1) {
      aces++;
      total += 11;
    } else total += Math.min(10, c.r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}
var isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
function dealerPlay(deck, dealer) {
  const h = [...dealer];
  while (handValue(h).total < 17) h.push(deck.shift());
  return h;
}
function bjOutcome(player, dealer) {
  const p = handValue(player).total, d = handValue(dealer).total;
  const pbj = isBlackjack(player), dbj = isBlackjack(dealer);
  if (p > 21) return "bust";
  if (pbj && !dbj) return "blackjack";
  if (pbj && dbj) return BJ_TIE_LOSES ? "lose" : "push";
  if (dbj) return "lose";
  if (d > 21) return "win";
  if (p > d) return "win";
  if (p === d) return BJ_TIE_LOSES ? "lose" : "push";
  return "lose";
}
var bjReturnMult = (o) => o === "blackjack" ? 1 + BJ_BLACKJACK_PAYS : o === "win" ? 2 : o === "push" ? 1 : 0;

// ../../../../../../home/claude/oddxs/shared/game-service.ts
var LAUNCH_DELAY_MS = 3e3;
var CLAIM_COMP_MS = 100;
var POLL_GRACE_MS = 650;
var MAX_CLAIM_LAG_MS = 500;
var MIN_LAUNCH_MS = 500, MAX_LAUNCH_MS = 8e3;
var GameError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
};
var locks = /* @__PURE__ */ new Map();
async function withLock(id, fn) {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.catch(() => {
  }).then(fn);
  locks.set(id, run);
  try {
    return await run;
  } finally {
    if (locks.get(id) === run) locks.delete(id);
  }
}
var reveal = (r) => ({ serverSeed: r.serverSeed, commit: r.commit, clientSeed: r.clientSeed, nonce: r.nonce });
var toCardArr = (c) => c.map((x) => ({ r: x.r, s: x.s }));
var GameService = class {
  constructor(store) {
    this.store = store;
  }
  async begin(game, stakeCp, state) {
    const cfg = await this.store.settings();
    if (!cfg.enabled[game]) throw new GameError("game_disabled");
    if (!Number.isInteger(stakeCp) || stakeCp < cfg.minBetCp) throw new GameError("min_bet");
    if (stakeCp > cfg.maxBetCp) throw new GameError("max_bet");
    const seeds = await this.store.beginSeeds();
    const commit = await sha256(seeds.serverSeed);
    const rng = await makeRng(seeds.serverSeed, seeds.clientSeed, seeds.nonce);
    const st = state(rng);
    const { id, balanceCp } = await this.store.openRound(game, stakeCp, st, { serverSeed: seeds.serverSeed, commit, clientSeed: seeds.clientSeed, nonce: seeds.nonce });
    return { id, balanceCp, commit, nextCommit: await sha256(seeds.nextServerSeed), cfg, st, seeds, rng };
  }
  async finish(r, payoutCp, mult, state) {
    const cfg = await this.store.settings();
    const capped = Math.min(payoutCp, cfg.maxPayoutCp);
    const res = await this.store.settle(r.id, capped, mult, state);
    return res;
  }
  /** What the client needs on app start: the next commit and any round that is still open. */
  async resume() {
    const nextCommit = await sha256(await this.store.pendingSeed());
    const out = { nextCommit };
    const c = await this.store.findOpen("crash");
    if (c) out.crash = await this.crashStatus(c.id).catch(() => null);
    const m = await this.store.findOpen("mines");
    if (m) out.mines = this.minesView(m);
    const b = await this.store.findOpen("blackjack");
    if (b) out.blackjack = this.bjView(b);
    return out;
  }
  /* ─────────────────────────── CRASH ─────────────────────────── */
  async crashStart(stakeCp, auto, launchInMs) {
    const open = await this.store.findOpen("crash");
    if (open) {
      await this.crashStatus(open.id);
      if ((await this.store.getRound(open.id))?.status === "open") throw new GameError("round_open");
    }
    const a = auto && Number.isFinite(auto) && auto >= 1.01 ? Math.min(1e6, Math.floor(auto * 100) / 100) : null;
    const now = this.store.now();
    const launchDelay = Number.isFinite(launchInMs) ? Math.min(MAX_LAUNCH_MS, Math.max(MIN_LAUNCH_MS, Math.round(launchInMs))) : LAUNCH_DELAY_MS;
    const b = await this.begin("crash", stakeCp, (rng) => ({ crash: crashPoint(rng), launchAt: now + launchDelay, auto: a }));
    return { id: b.id, commit: b.commit, nextCommit: b.nextCommit, balanceCp: b.balanceCp, launchAt: b.st.launchAt, serverNow: now, auto: a };
  }
  async crashCashout(id, clickAt) {
    return withLock(id, () => this.crashResolve(id, true, clickAt));
  }
  async crashStatus(id) {
    return withLock(id, () => this.crashResolve(id, false));
  }
  async crashResolve(id, claim, clickAt) {
    const r = await this.store.getRound(id);
    if (!r || r.game !== "crash") throw new GameError("not_found");
    const now = this.store.now();
    if (r.status === "settled") return this.crashDone(r, r.payoutCp ?? 0, r.mult ?? 0, r.state, void 0);
    const s = r.state;
    const elapsed = (now - s.launchAt) / 1e3;
    if (elapsed < 0) {
      if (claim) throw new GameError("not_started");
      return { status: "running", id, launchAt: s.launchAt, serverNow: now };
    }
    const crashT = s.crash <= 1 ? 0 : crashTimeAt(s.crash);
    const lagMs = claim ? Number.isFinite(clickAt) ? Math.min(MAX_CLAIM_LAG_MS, Math.max(CLAIM_COMP_MS, now - clickAt)) : CLAIM_COMP_MS : 0;
    const t = elapsed - lagMs / 1e3;
    const grace = claim ? 0 : POLL_GRACE_MS / 1e3;
    let win = false, mult = 0;
    if (s.auto && s.crash >= s.auto && t >= crashTimeAt(s.auto)) {
      win = true;
      mult = s.auto;
    } else if (t >= crashT + grace) {
      win = false;
    } else if (claim) {
      win = true;
      mult = Math.max(1, Math.floor(crashMultAt(Math.max(0, t)) * 100) / 100);
    } else return { status: "running", id, launchAt: s.launchAt, serverNow: now };
    const payout = win ? payoutFromCp(r.stakeCp, mult) : 0;
    const res = await this.finish(r, payout, win ? mult : 0, s);
    return this.crashDone(r, res.payoutCp, res.mult, s, res.balanceCp);
  }
  async crashDone(r, payoutCp, mult, s, balanceCp) {
    return {
      status: payoutCp > 0 ? "cashed" : "crashed",
      id: r.id,
      mult,
      payoutCp,
      crashPoint: s.crash,
      balanceCp: balanceCp ?? (await this.store.settle(r.id, payoutCp, mult, s)).balanceCp,
      ...reveal(r)
    };
  }
  /* ─────────────────────────── MINES ─────────────────────────── */
  async minesStart(stakeCp, mines) {
    if (!Number.isInteger(mines) || mines < 1 || mines > 24) throw new GameError("bad_mines");
    const open = await this.store.findOpen("mines");
    if (open) throw new GameError("round_open");
    const b = await this.begin("mines", stakeCp, (rng) => ({ mines, board: minesLayout(rng, mines), opened: [] }));
    return { id: b.id, commit: b.commit, nextCommit: b.nextCommit, balanceCp: b.balanceCp, mines, opened: [], mult: 1, nextMult: minesMult(mines, 1) };
  }
  minesView(r) {
    const s = r.state;
    return { id: r.id, stakeCp: r.stakeCp, mines: s.mines, opened: s.opened, mult: minesMult(s.mines, s.opened.length), nextMult: minesMult(s.mines, s.opened.length + 1), commit: r.commit };
  }
  async minesReveal(id, cell) {
    return withLock(id, async () => {
      const r = await this.store.getRound(id);
      if (!r || r.game !== "mines") throw new GameError("not_found");
      if (r.status !== "open") throw new GameError("round_closed");
      const s = r.state;
      if (!Number.isInteger(cell) || cell < 0 || cell >= MINES_CELLS || s.opened.includes(cell)) throw new GameError("bad_cell");
      if (s.board[cell]) {
        const res = await this.finish(r, 0, 0, s);
        return { id, safe: false, cell, board: s.board, opened: s.opened, status: "lost", balanceCp: res.balanceCp, ...reveal(r) };
      }
      s.opened = [...s.opened, cell];
      const mult = minesMult(s.mines, s.opened.length);
      if (s.opened.length === MINES_CELLS - s.mines) {
        const res = await this.finish(r, payoutFromCp(r.stakeCp, mult), mult, s);
        return { id, safe: true, cell, opened: s.opened, mult, status: "won", payoutCp: res.payoutCp, board: s.board, balanceCp: res.balanceCp, ...reveal(r) };
      }
      await this.store.setState(id, s);
      return { id, safe: true, cell, opened: s.opened, mult, nextMult: minesMult(s.mines, s.opened.length + 1), status: "open" };
    });
  }
  async minesCashout(id) {
    return withLock(id, async () => {
      const r = await this.store.getRound(id);
      if (!r || r.game !== "mines") throw new GameError("not_found");
      if (r.status !== "open") throw new GameError("round_closed");
      const s = r.state;
      if (s.opened.length < 1) throw new GameError("no_picks");
      const mult = minesMult(s.mines, s.opened.length);
      const res = await this.finish(r, payoutFromCp(r.stakeCp, mult), mult, s);
      return { id, status: "won", mult, payoutCp: res.payoutCp, board: s.board, opened: s.opened, balanceCp: res.balanceCp, ...reveal(r) };
    });
  }
  /* ─────────────────────────── DICE ─────────────────────────── */
  async diceRoll(stakeCp, mode, chance) {
    if (mode !== "under" && mode !== "over" || !Number.isInteger(chance) || chance < DICE_MIN_CHANCE || chance > DICE_MAX_CHANCE) throw new GameError("bad_params");
    const b = await this.begin("dice", stakeCp, (rng) => ({ roll: diceRoll(rng), mode, chance }));
    const { roll } = b.st;
    const win = diceWins(roll, mode, chance);
    const mult = diceMult(chance);
    const r = await this.store.getRound(b.id);
    const res = await this.finish(r, win ? payoutFromCp(stakeCp, mult) : 0, win ? mult : 0, b.st);
    return { id: b.id, roll, win, mult, payoutCp: res.payoutCp, balanceCp: res.balanceCp, nextCommit: b.nextCommit, ...reveal(r) };
  }
  /* ───────────────────────── BLACKJACK ───────────────────────── */
  async bjStart(stakeCp) {
    const open = await this.store.findOpen("blackjack");
    if (open) throw new GameError("round_open");
    const b = await this.begin("blackjack", stakeCp, (rng) => {
      const deck = shuffledDeck(rng);
      const player = [deck.shift(), deck.shift()];
      const dealer = [deck.shift(), deck.shift()];
      return { deck, player, dealer };
    });
    const r = await this.store.getRound(b.id);
    const s = r.state;
    if (isBlackjack(s.player) || isBlackjack(s.dealer)) return { ...await this.bjSettle(r, s), nextCommit: b.nextCommit, commit: b.commit };
    return { ...this.bjView(r), balanceCp: b.balanceCp, nextCommit: b.nextCommit, commit: b.commit };
  }
  bjView(r) {
    const s = r.state;
    return { id: r.id, status: "open", stakeCp: r.stakeCp, player: toCardArr(s.player), dealerUp: toCardArr([s.dealer[0]]), commit: r.commit };
  }
  async bjSettle(r, s) {
    const dealer = handValue(s.player).total > 21 ? s.dealer : dealerPlay(s.deck, s.dealer);
    const outcome = bjOutcome(s.player, dealer);
    const mult = bjReturnMult(outcome);
    const res = await this.finish(r, payoutFromCp(r.stakeCp, mult), mult, { ...s, dealer });
    return { id: r.id, status: "done", outcome, mult, payoutCp: res.payoutCp, player: toCardArr(s.player), dealer: toCardArr(dealer), balanceCp: res.balanceCp, ...reveal(r) };
  }
  async bjHit(id) {
    return withLock(id, async () => {
      const r = await this.store.getRound(id);
      if (!r || r.game !== "blackjack") throw new GameError("not_found");
      if (r.status !== "open") throw new GameError("round_closed");
      const s = r.state;
      s.player = [...s.player, s.deck.shift()];
      const v = handValue(s.player).total;
      if (v >= 21) return this.bjSettle(r, s);
      await this.store.setState(id, s);
      return this.bjView({ ...r, state: s });
    });
  }
  async bjStand(id) {
    return withLock(id, async () => {
      const r = await this.store.getRound(id);
      if (!r || r.game !== "blackjack") throw new GameError("not_found");
      if (r.status !== "open") throw new GameError("round_closed");
      return this.bjSettle(r, r.state);
    });
  }
};
export {
  CLAIM_COMP_MS,
  GameError,
  GameService,
  LAUNCH_DELAY_MS,
  POLL_GRACE_MS,
  MAX_CLAIM_LAG_MS
};
