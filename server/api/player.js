// Everything the player can do: profile, AdsGram task claim, games, withdrawals.
import { authenticateRequest } from '../lib/telegram-auth.js'
import { rpc } from '../lib/supabase.js'
import { makeStore } from '../lib/store.js'
import { GameService, GameError } from '../game-service.gen.js'
import { forceStatus, forgetForce } from '../lib/forcesub.js'
import { sendUserNotice, escapeHtml, telegramCall } from '../lib/telegram.js'
import { validateAdsgramCallback } from '../lib/adsgram.js'

const HTTP = { banned: 403, maintenance: 503, user_not_found: 404, registration_closed: 403, not_found: 404 }
function fail(res, e) {
  const code = e?.message || 'error'
  if (e?.isDb) {
    const detail = String(e.detail || '')
    const full = `${code} ${detail}`
    console.error('[ODDXS] database API error:', full)
    if (/schema cache|could not find the function|does not exist|undefined table|undefined column/i.test(full)) {
      return res.status(503).json({ ok: false, error: 'database_update_required' })
    }
    return res.status(HTTP[code] || 400).json({ ok: false, error: code, detail: e.detail })
  }
  if (e instanceof GameError) return res.status(HTTP[code] || 400).json({ ok: false, error: code, detail: e.detail })
  console.error('[ODDXS] api error:', e)
  return res.status(500).json({ ok: false, error: 'server_error' })
}

// tiny per-player limiter (status polling is ~5/s, so allow bursts)
const buckets = new Map()
function limited(id, perSec = 14) {
  const now = Date.now(); const b = buckets.get(id) || { t: now, n: perSec }
  b.n = Math.min(perSec, b.n + ((now - b.t) / 1000) * perSec); b.t = now
  if (b.n < 1) { buckets.set(id, b); return true }
  b.n -= 1; buckets.set(id, b); return false
}
setInterval(() => { const cut = Date.now() - 60000; for (const [k, v] of buckets) if (v.t < cut) buckets.delete(k) }, 60000).unref?.()

async function auth(req, res) {
  const tg = authenticateRequest(req)
  if (!tg) { res.status(401).json({ ok: false, error: 'open_in_telegram' }); return null }
  if (limited(tg.id)) { res.status(429).json({ ok: false, error: 'slow_down' }); return null }
  return tg
}

// blocks play/ads/tasks/withdrawals until the user joined every forced channel
async function gate(tg, res) {
  const on = await rpc('oddxs_public_settings').then((s) => s.force_sub_enabled !== false).catch(() => true)
  const f = await forceStatus(tg.id, on)
  if (!f.ok) { res.status(403).json({ ok: false, error: 'force_sub', channels: f.missing }); return false }
  return true
}

export async function me(req, res) {
  const tg = await auth(req, res); if (!tg) return
  try {
    const ref = /^ref_(\d{5,20})$/.exec(tg.startParam || '')?.[1] || null
    const user = await rpc('oddxs_upsert_user', { p_tid: tg.id, p_username: tg.username, p_first: tg.firstName, p_last: tg.lastName, p_lang: tg.languageCode, p_ref: ref })
    // Keep the core app available when an existing database has not received
    // the optional V6 Exchange migration yet. Exchange history is not required
    // to open the lobby, so a missing RPC/table must not block account loading.
    const [settings, withdrawals, history] = await Promise.all([
      rpc('oddxs_public_settings'),
      rpc('oddxs_my_withdrawals', { p_tid: tg.id }),
      rpc('oddxs_my_history', { p_tid: tg.id }),
    ])

    let exchanges = []
    let exchangeReady = true
    try {
      exchanges = await rpc('oddxs_my_exchanges', { p_tid: tg.id, p_limit: 30 })
    } catch (e) {
      exchangeReady = false
      console.warn('[ODDXS] Exchange migration is missing or incomplete; app will start with Exchange disabled:', e?.message || e)
    }

    // Safe defaults also keep the Exchange screen renderable on pre-V6 databases.
    try { Object.assign(settings, await rpc('oddxs_int_status', { p_tid: tg.id })) } catch { settings.adsgram_int_reward_pts = 0; settings.adsgram_int_min_seconds = 5; settings.adsgram_int_cap = 10; settings.adsgram_int_today = 0 } // int SQL not installed yet → button hidden
    settings.exchange_enabled = exchangeReady && settings.exchange_enabled === true
    settings.exchange_min_pts = Number(settings.exchange_min_pts ?? 100)
    settings.exchange_max_pts = Number(settings.exchange_max_pts ?? 100000)
    settings.exchange_points_per_usdt = Number(settings.exchange_points_per_usdt ?? 2000)
    const force = await forceStatus(tg.id, settings.force_sub_enabled !== false).catch(() => ({ ok: true, missing: [] }))
    const resume = user.is_banned ? {} : await new GameService(makeStore(tg.id)).resume().catch(() => ({}))
    res.json({ ok: true, user, settings, withdrawals, history, exchanges, resume, force: { ok: force.ok, channels: force.missing }, botUsername: process.env.BOT_USERNAME || null })
  } catch (e) { fail(res, e) }
}

// /api/auth/me — two callers, one endpoint:
//  1) AdsGram servers (GET/POST with ?secret=&userid=&kind=native_task): validates and records a PENDING reward.
//  2) The Mini App (Telegram initData): action "adsgram_task_claim" atomically turns that pending event into balance.
// Without a secret the request falls through to the normal profile bootstrap (same as /api/me).
export async function authMe(req, res) {
  if (req.query?.secret !== undefined || req.query?.userid !== undefined || req.query?.userId !== undefined) {
    const v = validateAdsgramCallback(req.query)
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error })
    try { return res.json(await rpc('oddxs_adsgram_task_webhook', { p_tid: v.tid })) }
    catch (e) {
      if (e?.isDb && ['user_not_found', 'banned'].includes(e.message)) return res.status(HTTP[e.message]).json({ ok: false, error: e.message })
      return fail(res, e)
    }
  }
  if (req.method === 'POST' && req.body?.action === 'adsgram_task_claim') {
    const tg = await auth(req, res); if (!tg) return
    if (!(await gate(tg, res))) return
    try { return res.json(await rpc('oddxs_adsgram_task_claim', { p_tid: tg.id })) } catch (e) { return fail(res, e) }
  }
  // Rewarded interstitial (int-59439): prepare → show ad → confirm. The server measures the watch time itself.
  if (req.method === 'POST' && ['int_prepare', 'int_confirm'].includes(req.body?.action)) {
    const tg = await auth(req, res); if (!tg) return
    if (!(await gate(tg, res))) return
    try {
      if (req.body.action === 'int_prepare') return res.json(await rpc('oddxs_int_prepare', { p_tid: tg.id }))
      const id = String(req.body.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'bad_pulse' })
      const r = await rpc('oddxs_int_confirm', { p_tid: tg.id, p_id: id })
      return res.status(r.ok ? 200 : 400).json(r.ok ? r : { ok: false, error: r.error })
    } catch (e) { return fail(res, e) }
  }
  return me(req, res)
}

export async function game(req, res) {
  const tg = await auth(req, res); if (!tg) return
  if (!(await gate(tg, res))) return
  try {
    const b = req.body || {}
    const g = new GameService(makeStore(tg.id))
    const int = (v) => Math.trunc(Number(v))
    let out
    switch (`${b.game}:${b.action}`) {
      case 'crash:start': out = await g.crashStart(int(b.stakeCp), b.auto ? Number(b.auto) : null, b.launchIn != null ? Number(b.launchIn) : null); break
      case 'crash:cashout': out = await g.crashCashout(String(b.id), b.at != null ? Number(b.at) : null); break
      case 'crash:status': out = await g.crashStatus(String(b.id)); break
      case 'mines:start': out = await g.minesStart(int(b.stakeCp), int(b.mines)); break
      case 'mines:reveal': out = await g.minesReveal(String(b.id), int(b.cell)); break
      case 'mines:cashout': out = await g.minesCashout(String(b.id)); break
      case 'dice:roll': out = await g.diceRoll(int(b.stakeCp), b.mode, int(b.chance)); break
      case 'blackjack:start': out = await g.bjStart(int(b.stakeCp)); break
      case 'blackjack:hit': out = await g.bjHit(String(b.id)); break
      case 'blackjack:stand': out = await g.bjStand(String(b.id)); break
      default: return res.status(400).json({ ok: false, error: 'bad_action' })
    }
    res.json({ ok: true, ...out })
  } catch (e) { fail(res, e) }
}

export async function withdraw(req, res) {
  const tg = await auth(req, res); if (!tg) return
  if (!(await gate(tg, res))) return
  try {
    if (req.method === 'GET') return res.json({ ok: true, withdrawals: await rpc('oddxs_my_withdrawals', { p_tid: tg.id }) })
    const b = req.body || {}
    const w = await rpc('oddxs_create_withdrawal', { p_tid: tg.id, p_points: Number(b.points), p_method: String(b.method), p_target: String(b.target || '') })
    res.json({ ok: true, withdrawal: w })
    // tell the admin chat (optional) — fire and forget
    const chat = process.env.ADMIN_NOTIFY_CHAT_ID
    if (chat) {
      const who = tg.username ? `@${escapeHtml(tg.username)}` : escapeHtml(tg.firstName)
      telegramCall('sendMessage', {
        chat_id: chat, parse_mode: 'HTML',
        text: `💸 <b>New withdrawal</b>\nUser: ${who} (<code>${tg.id}</code>)\nAmount: <b>${(w.amount_cp / 100).toFixed(0)} pts</b> (≈ $${Number(w.usd).toFixed(3)})\nMethod: <b>${w.method === 'gram' ? 'Gram' : 'Binance ID'}</b>\nTarget: <code>${escapeHtml(w.target)}</code>`,
      }).catch(() => {})
    }
  } catch (e) { fail(res, e) }
}

export async function exchange(req, res) {
  const tg = await auth(req, res); if (!tg) return
  if (!(await gate(tg, res))) return
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'bad_action' })
    const raw = Number(req.body?.points)
    if (!Number.isSafeInteger(raw) || raw <= 0) return res.status(400).json({ ok: false, error: 'bad_amount' })
    const out = await rpc('oddxs_exchange_points', { p_tid: tg.id, p_points: raw })
    return res.json({ ok: true, exchange: out.exchange, balance_cp: Number(out.balance_cp), usdt_balance: Number(out.usdt_balance) })
  } catch (e) { fail(res, e) }
}

// Tasks: list, start (opens the link), complete (server verifies channel membership / wait time)
export async function tasks(req, res) {
  const tg = await auth(req, res); if (!tg) return
  if (!(await gate(tg, res))) return
  try {
    const b = req.body || {}
    const id = String(b.taskId || '')
    if (b.action === 'list') return res.json({ ok: true, tasks: await rpc('oddxs_tasks_list', { p_tid: tg.id }) })
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'bad_action' })
    if (b.action === 'start') return res.json({ ok: true, ...(await rpc('oddxs_task_start', { p_tid: tg.id, p_id: id })) })
    if (b.action === 'complete') {
      const t = await rpc('oddxs_task_get', { p_id: id })
      if (!t) return res.status(404).json({ ok: false, error: 'task_not_found' })
      let verified = false
      if (t.type === 'channel') {
        try {
          const m = await telegramCall('getChatMember', { chat_id: t.chat_id, user_id: Number(tg.id) })
          verified = ['member', 'administrator', 'creator'].includes(m?.status) || (m?.status === 'restricted' && m.is_member === true)
        } catch (e) { console.error('[ODDXS] getChatMember failed (is the bot an admin of the channel?):', e.message); return res.status(400).json({ ok: false, error: 'verify_failed' }) }
      }
      return res.json({ ok: true, ...(await rpc('oddxs_task_complete', { p_tid: tg.id, p_id: id, p_verified: verified })) })
    }
    res.status(400).json({ ok: false, error: 'bad_action' })
  } catch (e) { fail(res, e) }
}

// Leaderboard: top players by points or by referrals (+ the caller's own rank). Read-only, cached 20s per (kind, player).
const lbCache = new Map()
export async function leaderboard(req, res) {
  const tg = await auth(req, res); if (!tg) return
  const kind = (req.body?.kind || req.query?.kind) === 'referrals' ? 'referrals' : 'points'
  const key = `${kind}:${tg.id}`
  const hit = lbCache.get(key)
  if (hit && Date.now() - hit.t < 20000) return res.json(hit.v)
  try {
    const out = { ok: true, ...(await rpc('oddxs_leaderboard', { p_kind: kind, p_tid: tg.id, p_limit: 10 })) }
    if (lbCache.size > 2000) lbCache.clear()
    lbCache.set(key, { t: Date.now(), v: out })
    res.json(out)
  } catch (e) { fail(res, e) }
}
