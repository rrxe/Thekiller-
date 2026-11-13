// One interface, two backends:
//  • ServerApi — the real thing (Supabase via /api/*). Used inside Telegram.
//  • DemoApi  — the SAME GameService running in the browser on localStorage (no real value). Used when there is no
//               Telegram session (e.g. opening the page in a normal browser), clearly labelled "DEMO" in the UI.
import { GameError, GameService, type GameId, type RoundRow, type Store, type Seeds, type GameSettings } from "../../shared/game-service";
import { randomSeed } from "../../shared/engine";
import { initData } from "./telegram";

export interface PublicSettings {
  app_name: string; maintenance: boolean; adsgram_task_reward_pts: number; adsgram_int_reward_pts?: number; adsgram_int_min_seconds?: number; adsgram_int_cap?: number; adsgram_int_today?: number; min_bet_pts: number; max_bet_pts: number;
  points_per_usd: number; exchange_enabled: boolean; exchange_min_pts: number; exchange_max_pts: number; exchange_points_per_usdt: number; min_withdrawal_pts: number; max_withdrawal_pts: number; withdrawal_ads_required: number; withdrawal_cooldown_h: number;
  gram_enabled: boolean; binance_enabled: boolean; gram_label: string; payment_note: string; support_username: string;
  referral_reward_pts?: number; referral_ads_required?: number; referral_required_tasks?: number;
  games: Record<GameId, boolean>;
}
export interface TaskDto { id: string; title_en: string; title_ar: string; type: "channel" | "link"; url: string; reward_cp: number; wait_seconds: number; done: boolean; started_at_ms: number | null }
export interface UserDto {
  telegram_id: string; first_name?: string; balance_cp: number; usdt_balance?: number; ads_total: number;
  withdrawal_ads_watched: number; is_banned: boolean; referral_count: number; tasks_done?: number;
}
export interface ExchangeDto { id: string; points: number; usdt: number; rate_points_per_usdt: number; created_at: string }
export interface WithdrawalDto { id: string; amount_cp: number; usd: number; method: "gram" | "binance"; target: string; status: "pending" | "paid" | "rejected"; admin_note?: string; tx_ref?: string; created_at: string }
export interface HistoryDto { id: string | number; game: GameId; betCp: number; payoutCp: number; mult: number; ts: number }
export interface ForceChannel { id: string; title: string; url: string }
export interface Me { user: UserDto; settings: PublicSettings; exchanges?: ExchangeDto[]; withdrawals: WithdrawalDto[]; history: HistoryDto[]; resume: any; botUsername?: string | null; force?: { ok: boolean; channels: ForceChannel[] } }
export interface TaskClaim { ok: boolean; pending: boolean; duplicate?: boolean; reward_cp?: number; balance_cp?: number; ads_total?: number; withdrawal_ads_watched?: number; int_today?: number }

export interface LeaderRow { rank: number; name: string; score: number; me?: boolean }
export interface Leaderboard { top: LeaderRow[]; me: { rank: number; name: string; score: number } | null }

export class ApiError extends Error {
  code: string; detail?: string;
  constructor(code: string, detail?: string) { super(code); this.code = code; this.detail = detail; }
}

export interface Api {
  mode: "server" | "demo";
  me(): Promise<Me>;
  adsgramClaim(): Promise<TaskClaim>;
  intPrepare(): Promise<{ id: string; min_seconds: number }>;
  intConfirm(id: string): Promise<TaskClaim>;
  tasks(): Promise<TaskDto[]>;
  taskStart(id: string): Promise<void>;
  taskComplete(id: string): Promise<{ reward_cp: number; balance_cp: number; tasks_done: number }>;
  game(game: GameId, action: string, params?: Record<string, unknown>): Promise<any>;
  withdraw(points: number, method: "gram" | "binance", target: string): Promise<{ withdrawal: WithdrawalDto; balance_cp: number }>;
  exchange(points: number): Promise<{ exchange: ExchangeDto; balance_cp: number; usdt_balance: number }>;
  leaderboard(kind: "points" | "referrals"): Promise<Leaderboard>;
}

/* ───────────────────────────── server ───────────────────────────── */
class ServerApi implements Api {
  mode = "server" as const;
  private async call(path: string, body: unknown, method = "POST") {
    let res: Response;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      res = await fetch(path, { method, headers: { "Content-Type": "application/json", "x-telegram-init-data": initData() }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}), signal: controller.signal });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw new ApiError("timeout");
      throw new ApiError("network");
    } finally { window.clearTimeout(timeout); }
    const raw = await res.text().catch(() => "");
    let data: any;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch {
      // This usually means /api/* is being served by a static host/fallback page
      // instead of the ODDXS Node server.
      throw new ApiError("api_unavailable", `HTTP ${res.status}; expected JSON from ${path}`);
    }
    if (data.error === "force_sub") { try { window.dispatchEvent(new Event("oddxs:force")); } catch { /* */ } }
    if (!res.ok || data.ok === false) throw new ApiError(data.error || "generic", data.detail || `HTTP ${res.status}`);
    if (data.ok !== true) throw new ApiError("api_unavailable", `Invalid API response from ${path}`);
    return data;
  }
  me = () => this.call("/api/me", {}) as Promise<Me>;
  adsgramClaim = () => this.call("/api/auth/me", { action: "adsgram_task_claim" }) as Promise<TaskClaim>;
  intPrepare = () => this.call("/api/auth/me", { action: "int_prepare" }) as Promise<{ id: string; min_seconds: number }>;
  intConfirm = (id: string) => this.call("/api/auth/me", { action: "int_confirm", id }) as Promise<TaskClaim>;
  tasks = async () => (await this.call("/api/tasks", { action: "list" })).tasks as TaskDto[];
  taskStart = async (id: string) => { await this.call("/api/tasks", { action: "start", taskId: id }); };
  taskComplete = (id: string) => this.call("/api/tasks", { action: "complete", taskId: id });
  game = (game: GameId, action: string, params: Record<string, unknown> = {}) => this.call("/api/game", { game, action, ...params });
  leaderboard = async (kind: "points" | "referrals") => { const r = await this.call("/api/leaderboard", { kind }); return { top: r.top || [], me: r.me || null } as Leaderboard; };
  withdraw = async (points: number, method: "gram" | "binance", target: string) => {
    const d = await this.call("/api/withdraw", { points, method, target });
    return { withdrawal: d.withdrawal as WithdrawalDto, balance_cp: d.withdrawal.balance_cp as number };
  };
  exchange = async (points: number) => {
    const d = await this.call("/api/exchange", { points });
    return { exchange: d.exchange as ExchangeDto, balance_cp: Number(d.balance_cp), usdt_balance: Number(d.usdt_balance) };
  };
}

/* ───────────────────────────── demo (local) ───────────────────────────── */
const DEMO_KEY = "oddxs.demo.v2";
const DEMO_SETTINGS: PublicSettings = {
  app_name: "ODDXS", maintenance: false, adsgram_task_reward_pts: 1, adsgram_int_reward_pts: 1, adsgram_int_min_seconds: 5, adsgram_int_cap: 10, adsgram_int_today: 0,
  min_bet_pts: 5, max_bet_pts: 500, points_per_usd: 2000,
  exchange_enabled: true, exchange_min_pts: 100, exchange_max_pts: 100000, exchange_points_per_usdt: 2000, min_withdrawal_pts: 200, max_withdrawal_pts: 600, withdrawal_ads_required: 3, withdrawal_cooldown_h: 24, gram_enabled: true, binance_enabled: true,
  gram_label: "Gram (TON)", payment_note: "", support_username: "", referral_reward_pts: 10, referral_ads_required: 0, referral_required_tasks: 2, games: { crash: true, mines: true, dice: true, blackjack: true },
};
interface Demo {
  cp: number; usdtBalance: number; exchanges: ExchangeDto[]; adsTotal: number; wdAds: number; lastWdAt: number;
  clientSeed: string; nonce: number; pending: string; rounds: Record<string, RoundRow>; withdrawals: WithdrawalDto[]; history: HistoryDto[]; pulse: { id: string; ts: number } | null;
}
function loadDemo(): Demo {
  try { const raw = localStorage.getItem(DEMO_KEY); if (raw) return JSON.parse(raw); } catch { /* */ }
  return { cp: 20000, usdtBalance: 0, exchanges: [], adsTotal: 0, wdAds: 0, lastWdAt: 0, clientSeed: randomSeed(8), nonce: 0, pending: randomSeed(), rounds: {}, withdrawals: [], history: [], pulse: null };
}
const uid = () => randomSeed(8);

class LocalStore implements Store {
  constructor(private d: Demo, private save: () => void) {}
  now() { return Date.now(); }
  async settings(): Promise<GameSettings> {
    return { minBetCp: 500, maxBetCp: 50000, maxPayoutCp: 500000, enabled: { crash: true, mines: true, dice: true, blackjack: true } };
  }
  async pendingSeed() { return this.d.pending; }
  async beginSeeds(): Promise<Seeds> {
    const s = this.d.pending; this.d.pending = randomSeed(); this.d.nonce++; this.save();
    return { serverSeed: s, nextServerSeed: this.d.pending, clientSeed: this.d.clientSeed, nonce: this.d.nonce };
  }
  async openRound(game: GameId, stakeCp: number, state: any, seeds: { serverSeed: string; commit: string; clientSeed: string; nonce: number }) {
    if (this.d.cp < stakeCp) throw new GameError("insufficient");
    this.d.cp -= stakeCp; const id = uid();
    this.d.rounds[id] = { id, game, stakeCp, status: "open", state: JSON.parse(JSON.stringify(state)), ...seeds }; this.save();
    return { id, balanceCp: this.d.cp };
  }
  async getRound(id: string) { const r = this.d.rounds[id]; return r ? (JSON.parse(JSON.stringify(r)) as RoundRow) : null; }
  async findOpen(game: GameId) { const r = Object.values(this.d.rounds).find((x) => x.game === game && x.status === "open"); return r ? (JSON.parse(JSON.stringify(r)) as RoundRow) : null; }
  async setState(id: string, state: any) { this.d.rounds[id].state = JSON.parse(JSON.stringify(state)); this.save(); }
  async settle(id: string, payoutCp: number, mult: number, state: any) {
    const r = this.d.rounds[id];
    if (r.status === "settled") return { settled: false, payoutCp: r.payoutCp ?? 0, mult: r.mult ?? 0, balanceCp: this.d.cp };
    r.status = "settled"; r.payoutCp = payoutCp; r.mult = mult; r.state = JSON.parse(JSON.stringify(state)); this.d.cp += payoutCp;
    this.d.history.unshift({ id, game: r.game, betCp: r.stakeCp, payoutCp, mult, ts: Date.now() }); this.d.history = this.d.history.slice(0, 20);
    this.save();
    return { settled: true, payoutCp, mult, balanceCp: this.d.cp };
  }
}

class DemoApi implements Api {
  mode = "demo" as const;
  private d = loadDemo();
  private S = DEMO_SETTINGS;
  private save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.d)); } catch { /* */ } };
  private svc = new GameService(new LocalStore(this.d, this.save));
  private user(): UserDto {
    const d = this.d;
    return { telegram_id: "demo", first_name: "Demo", balance_cp: d.cp, usdt_balance: Number(d.usdtBalance || 0), ads_total: d.adsTotal, withdrawal_ads_watched: d.wdAds, is_banned: false, referral_count: 0 };
  }
  // demo tasks (local only — no real value)
  private dt = (() => { try { return JSON.parse(localStorage.getItem("oddxs.demo.tasks") || "{}") as Record<string, { s?: number; done?: boolean }>; } catch { return {}; } })();
  private saveT = () => { try { localStorage.setItem("oddxs.demo.tasks", JSON.stringify(this.dt)); } catch { /* */ } };
  private DT: TaskDto[] = [
    { id: "d1", title_en: "Join our channel", title_ar: "انضم لقناتنا", type: "channel", url: "https://t.me/telegram", reward_cp: 100, wait_seconds: 5, done: false, started_at_ms: null },
    { id: "d2", title_en: "Visit our website", title_ar: "زر موقعنا", type: "link", url: "https://example.com", reward_cp: 50, wait_seconds: 5, done: false, started_at_ms: null },
  ];
  async leaderboard(kind: "points" | "referrals"): Promise<Leaderboard> {
    const names = ["Omar", "Sara", "Khaled", "Lina", "Yusuf", "Maya", "Ali", "Noor"];
    const base = kind === "points" ? [820000, 540000, 410000, 260000, 190000, 120000, 80000, 50000] : [48, 33, 27, 19, 12, 9, 6, 3];
    const mine = kind === "points" ? this.d.cp : 0;
    const top: LeaderRow[] = names.map((name, i) => ({ rank: i + 1, name, score: base[i] }));
    return { top, me: mine > 0 ? { rank: top.filter((r) => r.score > mine).length + 1, name: "Demo", score: mine } : null };
  }
  async tasks() { return this.DT.map((t) => ({ ...t, done: !!this.dt[t.id]?.done, started_at_ms: this.dt[t.id]?.s ?? null })); }
  async taskStart(id: string) { this.dt[id] = { ...this.dt[id], s: this.dt[id]?.s ?? Date.now() }; this.saveT(); }
  async taskComplete(id: string) {
    const t = this.DT.find((x) => x.id === id); const p = this.dt[id];
    if (!t) throw new ApiError("task_not_found"); if (p?.done) throw new ApiError("task_done");
    if (!p?.s || Date.now() - p.s < t.wait_seconds * 1000) throw new ApiError("task_wait", String(Math.max(1, Math.ceil(t.wait_seconds - (Date.now() - (p?.s ?? Date.now())) / 1000))));
    this.dt[id] = { ...p, done: true }; this.saveT(); this.d.cp += t.reward_cp; this.save();
    return { reward_cp: t.reward_cp, balance_cp: this.d.cp, tasks_done: Object.values(this.dt).filter((x) => x.done).length };
  }
  async me(): Promise<Me> { return { user: this.user(), settings: this.S, exchanges: this.d.exchanges || [], withdrawals: this.d.withdrawals, history: this.d.history, resume: await this.svc.resume() }; }
  private intAt = 0;
  async intPrepare() { this.intAt = Date.now(); return { id: "demo", min_seconds: 5 }; }
  async intConfirm(_id: string): Promise<TaskClaim> {
    if (Date.now() - this.intAt < 5000) throw new ApiError("too_fast");
    const d = this.d; const reward = Math.round((this.S.adsgram_int_reward_pts ?? 1) * 100);
    d.adsTotal++; d.wdAds++; d.cp += reward; this.save();
    return { ok: true, pending: false, reward_cp: reward, balance_cp: d.cp, ads_total: d.adsTotal, withdrawal_ads_watched: d.wdAds, int_today: (this.S.adsgram_int_today = (this.S.adsgram_int_today ?? 0) + 1) };
  }
  async adsgramClaim(): Promise<TaskClaim> {
    // DEMO only (localStorage, no real value). The real flow is verified server-side by the AdsGram callback.
    const d = this.d; const reward = Math.round(this.S.adsgram_task_reward_pts * 100);
    d.adsTotal++; d.wdAds++; d.cp += reward; this.save();
    return { ok: true, pending: false, reward_cp: reward, balance_cp: d.cp, ads_total: d.adsTotal, withdrawal_ads_watched: d.wdAds };
  }
  async game(game: GameId, action: string, p: Record<string, any> = {}) {
    try {
      const s = this.svc; const k = `${game}:${action}`;
      switch (k) {
        case "crash:start": return await s.crashStart(p.stakeCp, p.auto || null, p.launchIn ?? null);
        case "crash:cashout": return await s.crashCashout(p.id, p.at ?? null);
        case "crash:status": return await s.crashStatus(p.id);
        case "mines:start": return await s.minesStart(p.stakeCp, p.mines);
        case "mines:reveal": return await s.minesReveal(p.id, p.cell);
        case "mines:cashout": return await s.minesCashout(p.id);
        case "dice:roll": return await s.diceRoll(p.stakeCp, p.mode, p.chance);
        case "blackjack:start": return await s.bjStart(p.stakeCp);
        case "blackjack:hit": return await s.bjHit(p.id);
        case "blackjack:stand": return await s.bjStand(p.id);
      }
    } catch (e) { if (e instanceof GameError) throw new ApiError(e.code); throw e; }
    throw new ApiError("bad_action");
  }
  async exchange(points: number) {
    const d = this.d, S = this.S;
    if (!S.exchange_enabled) throw new ApiError("exchange_disabled");
    if (!Number.isInteger(points)) throw new ApiError("bad_amount");
    if (points < S.exchange_min_pts) throw new ApiError("exchange_min", String(S.exchange_min_pts));
    if (points > S.exchange_max_pts) throw new ApiError("exchange_max", String(S.exchange_max_pts));
    if (d.cp < points * 100) throw new ApiError("insufficient");
    const usdt = Number((points / S.exchange_points_per_usdt).toFixed(8));
    d.cp -= points * 100; d.usdtBalance = Number((Number(d.usdtBalance || 0) + usdt).toFixed(8));
    const exchange: ExchangeDto = { id: uid(), points, usdt, rate_points_per_usdt: S.exchange_points_per_usdt, created_at: new Date().toISOString() };
    d.exchanges = [exchange, ...(d.exchanges || [])].slice(0, 30); this.save();
    return { exchange, balance_cp: d.cp, usdt_balance: d.usdtBalance };
  }
  async withdraw(points: number, method: "gram" | "binance", target: string) {
    const d = this.d, S = this.S; const t = target.trim();
    if (method === "gram" && !(/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(t) || /^-?[0-9]:[0-9a-fA-F]{64}$/.test(t))) throw new ApiError("bad_gram_address");
    if (method === "binance" && !/^[0-9]{6,15}$/.test(t)) throw new ApiError("bad_binance_id");
    if (!Number.isInteger(points)) throw new ApiError("bad_amount");
    if (points < S.min_withdrawal_pts) throw new ApiError("withdraw_min", String(S.min_withdrawal_pts));
    if (points > S.max_withdrawal_pts) throw new ApiError("withdraw_max", String(S.max_withdrawal_pts));
    if (d.cp < points * 100) throw new ApiError("insufficient");
    if (d.withdrawals.some((w) => w.status === "pending")) throw new ApiError("pending_exists");
    if (d.wdAds < S.withdrawal_ads_required) throw new ApiError("need_ads", String(S.withdrawal_ads_required - d.wdAds));
    d.cp -= points * 100; d.wdAds = 0;
    const w: WithdrawalDto = { id: uid(), amount_cp: points * 100, usd: points / S.points_per_usd, method, target: t, status: "pending", created_at: new Date().toISOString() };
    d.withdrawals.unshift(w); this.save();
    return { withdrawal: w, balance_cp: d.cp };
  }
}

let api: Api | null = null;
export function getApi(): Api {
  if (!api) {
    const forceDemo = typeof location !== "undefined" && /[?&]demo=1/.test(location.search);
    api = !forceDemo && initData() ? new ServerApi() : new DemoApi();
  }
  return api;
}
export const isDemo = () => getApi().mode === "demo";
