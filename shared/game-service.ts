// ODDXS GameService — the ONE implementation of game rules.
//  • Server: runs with a Supabase-backed Store (authoritative, real balances).
//  • Browser demo mode: runs with a localStorage Store (no real value).
// It never touches the DOM or a database directly; everything goes through `Store`.
import {
  bjOutcome, bjReturnMult, crashMultAt, crashPoint, crashTimeAt, dealerPlay, diceRoll, diceWins, diceMult, handValue,
  isBlackjack, makeRng, minesLayout, minesMult, payoutFromCp, sha256, shuffledDeck, MINES_CELLS,
  DICE_MAX_CHANCE, DICE_MIN_CHANCE, type BjOutcome, type Card, type DiceMode,
} from "./engine";

export type GameId = "crash" | "mines" | "dice" | "blackjack";
export const LAUNCH_DELAY_MS = 3000; // 3-2-1 before take-off
export const CLAIM_COMP_MS = 100; // manual cash-out is priced ~half an RTT earlier than it arrived
export const POLL_GRACE_MS = 650; // a status poll never declares a crash before in-flight cash-outs could land
export const MAX_CLAIM_LAG_MS = 500; // a cash-out is judged at the moment the player CLICKED (client timestamp), at most this far in the past
export const MIN_LAUNCH_MS = 500, MAX_LAUNCH_MS = 8000; // client-aligned launch window (global 24/7 loop)

export class GameError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export interface RoundRow {
  id: string; game: GameId; stakeCp: number; status: "open" | "settled";
  state: any; serverSeed: string; commit: string; clientSeed: string; nonce: number; payoutCp?: number; mult?: number;
}
export interface GameSettings {
  minBetCp: number; maxBetCp: number; maxPayoutCp: number; enabled: Record<GameId, boolean>;
}
export interface Seeds { serverSeed: string; nextServerSeed: string; clientSeed: string; nonce: number }

export interface Store {
  now(): number;
  settings(): Promise<GameSettings>;
  /** current pending server seed (created if missing) — its hash is what players see BEFORE betting */
  pendingSeed(): Promise<string>;
  /** consume the pending seed, rotate a new one, bump nonce */
  beginSeeds(): Promise<Seeds>;
  /** debit stake atomically and insert the round. Throws GameError('insufficient') when balance is too low. */
  openRound(game: GameId, stakeCp: number, state: any, seeds: { serverSeed: string; commit: string; clientSeed: string; nonce: number }): Promise<{ id: string; balanceCp: number }>;
  getRound(id: string): Promise<RoundRow | null>;
  findOpen(game: GameId): Promise<RoundRow | null>;
  setState(id: string, state: any): Promise<void>;
  /** settle once (idempotent): credits payout. Returns stored values when it was already settled. */
  settle(id: string, payoutCp: number, mult: number, state: any): Promise<{ settled: boolean; payoutCp: number; mult: number; balanceCp: number }>;
}

const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(id, run);
  try { return await run; } finally { if (locks.get(id) === run) locks.delete(id); }
}

const reveal = (r: RoundRow) => ({ serverSeed: r.serverSeed, commit: r.commit, clientSeed: r.clientSeed, nonce: r.nonce });
const toCardArr = (c: Card[]) => c.map((x) => ({ r: x.r, s: x.s }));

export class GameService {
  constructor(private store: Store) {}

  private async begin(game: GameId, stakeCp: number, state: (rng: Awaited<ReturnType<typeof makeRng>>) => any) {
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
  private async finish(r: RoundRow, payoutCp: number, mult: number, state: any) {
    const cfg = await this.store.settings();
    const capped = Math.min(payoutCp, cfg.maxPayoutCp);
    const res = await this.store.settle(r.id, capped, mult, state);
    return res;
  }

  /** What the client needs on app start: the next commit and any round that is still open. */
  async resume() {
    const nextCommit = await sha256(await this.store.pendingSeed());
    const out: any = { nextCommit };
    const c = await this.store.findOpen("crash");
    if (c) out.crash = await this.crashStatus(c.id).catch(() => null);
    const m = await this.store.findOpen("mines");
    if (m) out.mines = this.minesView(m);
    const b = await this.store.findOpen("blackjack");
    if (b) out.blackjack = this.bjView(b);
    return out;
  }

  /* ─────────────────────────── CRASH ─────────────────────────── */
  async crashStart(stakeCp: number, auto?: number | null, launchInMs?: number | null) {
    const open = await this.store.findOpen("crash");
    if (open) { await this.crashStatus(open.id); if ((await this.store.getRound(open.id))?.status === "open") throw new GameError("round_open"); }
    const a = auto && Number.isFinite(auto) && auto >= 1.01 ? Math.min(1_000_000, Math.floor(auto * 100) / 100) : null;
    const now = this.store.now();
    // the shared client loop tells us when the next global round lifts off; clamp so it can never be abused to peek ahead
    const launchDelay = Number.isFinite(launchInMs as number) ? Math.min(MAX_LAUNCH_MS, Math.max(MIN_LAUNCH_MS, Math.round(launchInMs as number))) : LAUNCH_DELAY_MS;
    const b = await this.begin("crash", stakeCp, (rng) => ({ crash: crashPoint(rng), launchAt: now + launchDelay, auto: a }));
    return { id: b.id, commit: b.commit, nextCommit: b.nextCommit, balanceCp: b.balanceCp, launchAt: b.st.launchAt, serverNow: now, auto: a };
  }

  async crashCashout(id: string, clickAt?: number | null) { return withLock(id, () => this.crashResolve(id, true, clickAt)); }
  async crashStatus(id: string) { return withLock(id, () => this.crashResolve(id, false)); }

  private async crashResolve(id: string, claim: boolean, clickAt?: number | null) {
    const r = await this.store.getRound(id);
    if (!r || r.game !== "crash") throw new GameError("not_found");
    const now = this.store.now();
    if (r.status === "settled") return this.crashDone(r, r.payoutCp ?? 0, r.mult ?? 0, r.state, undefined);
    const s = r.state as { crash: number; launchAt: number; auto: number | null };
    const elapsed = (now - s.launchAt) / 1000;
    if (elapsed < 0) {
      if (claim) throw new GameError("not_started");
      return { status: "running", id, launchAt: s.launchAt, serverNow: now };
    }
    const crashT = s.crash <= 1 ? 0 : crashTimeAt(s.crash);
    // FIX: judge a cash-out by when the player CLICKED, not when the request arrived. The client sends its click time
    // (server-clock estimate); we trust it only within [CLAIM_COMP_MS, MAX_CLAIM_LAG_MS] before arrival.
    const lagMs = claim ? (Number.isFinite(clickAt as number) ? Math.min(MAX_CLAIM_LAG_MS, Math.max(CLAIM_COMP_MS, now - (clickAt as number))) : CLAIM_COMP_MS) : 0;
    const t = elapsed - lagMs / 1000;
    const grace = claim ? 0 : POLL_GRACE_MS / 1000;
    let win = false, mult = 0;
    if (s.auto && s.crash >= s.auto && t >= crashTimeAt(s.auto)) { win = true; mult = s.auto; }
    else if (t >= crashT + grace) { win = false; }
    else if (claim) { win = true; mult = Math.max(1, Math.floor(crashMultAt(Math.max(0, t)) * 100) / 100); }
    else return { status: "running", id, launchAt: s.launchAt, serverNow: now };

    const payout = win ? payoutFromCp(r.stakeCp, mult) : 0;
    const res = await this.finish(r, payout, win ? mult : 0, s);
    return this.crashDone(r, res.payoutCp, res.mult, s, res.balanceCp);
  }
  private async crashDone(r: RoundRow, payoutCp: number, mult: number, s: any, balanceCp?: number) {
    return {
      status: payoutCp > 0 ? "cashed" : "crashed", id: r.id, mult, payoutCp, crashPoint: s.crash,
      balanceCp: balanceCp ?? (await this.store.settle(r.id, payoutCp, mult, s)).balanceCp, ...reveal(r),
    };
  }

  /* ─────────────────────────── MINES ─────────────────────────── */
  async minesStart(stakeCp: number, mines: number) {
    if (!Number.isInteger(mines) || mines < 1 || mines > 24) throw new GameError("bad_mines");
    const open = await this.store.findOpen("mines");
    if (open) throw new GameError("round_open");
    const b = await this.begin("mines", stakeCp, (rng) => ({ mines, board: minesLayout(rng, mines), opened: [] as number[] }));
    return { id: b.id, commit: b.commit, nextCommit: b.nextCommit, balanceCp: b.balanceCp, mines, opened: [], mult: 1, nextMult: minesMult(mines, 1) };
  }
  private minesView(r: RoundRow) {
    const s = r.state;
    return { id: r.id, stakeCp: r.stakeCp, mines: s.mines, opened: s.opened, mult: minesMult(s.mines, s.opened.length), nextMult: minesMult(s.mines, s.opened.length + 1), commit: r.commit };
  }
  async minesReveal(id: string, cell: number) {
    return withLock(id, async () => {
      const r = await this.store.getRound(id);
      if (!r || r.game !== "mines") throw new GameError("not_found");
      if (r.status !== "open") throw new GameError("round_closed");
      const s = r.state as { mines: number; board: boolean[]; opened: number[] };
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
  async minesCashout(id: string) {
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
  async diceRoll(stakeCp: number, mode: DiceMode, chance: number) {
    if ((mode !== "under" && mode !== "over") || !Number.isInteger(chance) || chance < DICE_MIN_CHANCE || chance > DICE_MAX_CHANCE) throw new GameError("bad_params");
    const b = await this.begin("dice", stakeCp, (rng) => ({ roll: diceRoll(rng), mode, chance }));
    const { roll } = b.st;
    const win = diceWins(roll, mode, chance);
    const mult = diceMult(chance);
    const r = (await this.store.getRound(b.id))!;
    const res = await this.finish(r, win ? payoutFromCp(stakeCp, mult) : 0, win ? mult : 0, b.st);
    return { id: b.id, roll, win, mult, payoutCp: res.payoutCp, balanceCp: res.balanceCp, nextCommit: b.nextCommit, ...reveal(r) };
  }

  /* ───────────────────────── BLACKJACK ───────────────────────── */
  async bjStart(stakeCp: number) {
    const open = await this.store.findOpen("blackjack");
    if (open) throw new GameError("round_open");
    const b = await this.begin("blackjack", stakeCp, (rng) => {
      const deck = shuffledDeck(rng);
      const player = [deck.shift()!, deck.shift()!]; const dealer = [deck.shift()!, deck.shift()!];
      return { deck, player, dealer };
    });
    const r = (await this.store.getRound(b.id))!;
    const s = r.state as { deck: Card[]; player: Card[]; dealer: Card[] };
    if (isBlackjack(s.player) || isBlackjack(s.dealer)) return { ...(await this.bjSettle(r, s)), nextCommit: b.nextCommit, commit: b.commit };
    return { ...this.bjView(r), balanceCp: b.balanceCp, nextCommit: b.nextCommit, commit: b.commit };
  }
  private bjView(r: RoundRow) {
    const s = r.state;
    return { id: r.id, status: "open", stakeCp: r.stakeCp, player: toCardArr(s.player), dealerUp: toCardArr([s.dealer[0]]), commit: r.commit };
  }
  private async bjSettle(r: RoundRow, s: { deck: Card[]; player: Card[]; dealer: Card[] }) {
    const dealer = handValue(s.player).total > 21 ? s.dealer : dealerPlay(s.deck, s.dealer);
    const outcome: BjOutcome = bjOutcome(s.player, dealer);
    const mult = bjReturnMult(outcome);
    const res = await this.finish(r, payoutFromCp(r.stakeCp, mult), mult, { ...s, dealer });
    return { id: r.id, status: "done", outcome, mult, payoutCp: res.payoutCp, player: toCardArr(s.player), dealer: toCardArr(dealer), balanceCp: res.balanceCp, ...reveal(r) };
  }
  async bjHit(id: string) {
    return withLock(id, async () => {
      const r = await this.store.getRound(id);
      if (!r || r.game !== "blackjack") throw new GameError("not_found");
      if (r.status !== "open") throw new GameError("round_closed");
      const s = r.state;
      s.player = [...s.player, s.deck.shift()!];
      const v = handValue(s.player).total;
      if (v >= 21) return this.bjSettle(r, s);
      await this.store.setState(id, s);
      return this.bjView({ ...r, state: s });
    });
  }
  async bjStand(id: string) {
    return withLock(id, async () => {
      const r = await this.store.getRound(id);
      if (!r || r.game !== "blackjack") throw new GameError("not_found");
      if (r.status !== "open") throw new GameError("round_closed");
      return this.bjSettle(r, r.state);
    });
  }
}
