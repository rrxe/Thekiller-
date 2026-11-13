// ODDXS game engine — pure math + provably-fair randomness.
//
// Each game derives randomness from HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`).
// RTP is configured per game: Crash 97%; Mines and Dice remain 90% in this project version.
// The server seed's SHA-256 is shown BEFORE the round (commit) and the seed
// itself AFTER the round (reveal), so any player can re-compute the result.
//
// IMPORTANT: for real payouts this file must run on the SERVER (it is written
// without DOM dependencies so it can be imported from Node 18+ as-is).

export const RTP = 0.9; // Shared 90% RTP for Mines and Dice until their game-specific rules are migrated.
export const CRASH_RTP = 0.97; // Crash uses a 3% house edge (97% RTP), disclosed in its UI.
export const MIN_BET = 5;
export const POINTS_PER_USD = 2000; // 100 points = $0.05  →  1 point = $0.0005
export const MIN_WITHDRAW = 200; // $0.10 at the configured rate
export const MAX_WITHDRAW = 600; // $0.30 at the configured rate
export const MAX_CRASH = 1_000_000;

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(text: string): Promise<string> {
  return toHex(await subtle.digest("SHA-256", enc.encode(text)));
}

async function hmac(key: string, msg: string): Promise<Uint8Array> {
  const k = await subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, enc.encode(msg)));
}

export function randomSeed(bytes = 32): string {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Rng {
  /** uniform float in [0,1) — 32 bits of precision per call, 64 calls available */
  next(): number;
  /** first 52 bits of the first HMAC block as uniform [0,1) (used by Crash) */
  u52: number;
}

/** Deterministic RNG stream for one round. */
export async function makeRng(serverSeed: string, clientSeed: string, nonce: number): Promise<Rng> {
  const blocks: Uint8Array[] = [];
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
      const v = (bytes[c] / 256 + bytes[c + 1] / 65536 + bytes[c + 2] / 16777216 + bytes[c + 3] / 4294967296);
      c += 4;
      return v;
    },
  };
}

/* ───────────────────────────── money helpers ───────────────────────────── */
// Balances are stored as integer "centi-points" (1 point = 100 cp) to avoid float drift.
export const toCp = (points: number) => Math.round(points * 100);
export const fromCp = (cp: number) => cp / 100;
export const pointsToUsd = (points: number) => points / POINTS_PER_USD;
/** payout in cp for a stake in points and a multiplier (floored, never rounds in the player's favour) */
export const payoutCp = (stakePoints: number, mult: number) => Math.floor(stakePoints * 100 * mult + 1e-9);
/** same, from a stake already in centi-points */
export const payoutFromCp = (stakeCp: number, mult: number) => Math.floor(stakeCp * mult + 1e-9);

/* ─────────────────────────────── CRASH ─────────────────────────────────── */
/** P(crashPoint ≥ m) = CRASH_RTP / m for m > 1 → 97% RTP / 3% house edge.
 * The server calculates and stores this value before accepting the round.
 */
export function crashPoint(rng: Rng): number {
  const p = Math.floor((100 * CRASH_RTP) / (1 - rng.u52)) / 100;
  return Math.min(MAX_CRASH, Math.max(1, p));
}
/** growth curve shared by canvas + logic: multiplier after t seconds */
export const CRASH_GROWTH = 0.12;
export const crashMultAt = (tSec: number) => Math.exp(CRASH_GROWTH * tSec);
export const crashTimeAt = (mult: number) => Math.log(mult) / CRASH_GROWTH;

/* ─────────────────────────────── MINES ─────────────────────────────────── */
export const MINES_CELLS = 25;
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
/** multiplier after `picks` safe reveals with `mines` bombs on a 5×5 board */
export function minesMult(mines: number, picks: number): number {
  if (picks <= 0) return 1;
  const m = (RTP * comb(MINES_CELLS, picks)) / comb(MINES_CELLS - mines, picks);
  return Math.floor(m * 100) / 100;
}
export function minesLayout(rng: Rng, mines: number): boolean[] {
  const idx = Array.from({ length: MINES_CELLS }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const board = new Array<boolean>(MINES_CELLS).fill(false);
  for (let i = 0; i < mines; i++) board[idx[i]] = true;
  return board;
}

/* ─────────────────────────────── DICE ──────────────────────────────────── */
export type DiceMode = "under" | "over";
export const DICE_MIN_CHANCE = 2;
export const DICE_MAX_CHANCE = 95;
export const diceMult = (chancePct: number) => Math.floor(((RTP * 100) / chancePct) * 10000) / 10000;
/** roll in 0.00 … 99.99 (10 000 equally likely outcomes) */
export const diceRoll = (rng: Rng) => Math.floor(rng.next() * 10000) / 100;
export function diceWins(roll: number, mode: DiceMode, chancePct: number) {
  return mode === "under" ? roll < chancePct : roll >= 100 - chancePct;
}

/* ───────────────────────────── BLACKJACK ───────────────────────────────── */
export interface Card { r: number; s: number } // r: 1..13 (1=A), s: 0..3
export const BJ_BLACKJACK_PAYS = 1.2; // 6:5  (profit multiple) → total return 2.2×
export const BJ_TIE_LOSES = true; // published rule: dealer wins ties (disclosed in UI)
export function shuffledDeck(rng: Rng): Card[] {
  const d: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 1) { aces++; total += 11; } else total += Math.min(10, c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;
/** Dealer stands on all 17s. */
export function dealerPlay(deck: Card[], dealer: Card[]): Card[] {
  const h = [...dealer];
  while (handValue(h).total < 17) h.push(deck.shift()!);
  return h;
}
export type BjOutcome = "blackjack" | "win" | "push" | "lose" | "bust";
export function bjOutcome(player: Card[], dealer: Card[]): BjOutcome {
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
export const bjReturnMult = (o: BjOutcome) =>
  o === "blackjack" ? 1 + BJ_BLACKJACK_PAYS : o === "win" ? 2 : o === "push" ? 1 : 0;
