import { invalidateForce } from '../lib/forcesub.js'
import { requireAdmin, isOwner, ADMIN_PERMISSIONS } from '../lib/admin.js'
import { rpc } from '../lib/supabase.js'
import { invalidateSettings } from '../lib/store.js'
import { sendUserNotice, escapeHtml, telegramCall, getBotUsername } from '../lib/telegram.js'

const clean = (v, max = 300) => String(v ?? '').trim().slice(0, max)
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const page = (b) => ({ limit: Math.min(100, Math.max(1, Math.trunc(num(b.limit, 40)))), offset: Math.max(0, Math.trunc(num(b.offset, 0))) })

const PERM = {
  stats: 'dashboard', users: 'users', user_detail: 'users', ban_user: 'users', adjust_balance: 'users',
  withdrawals: 'withdrawals', review_withdrawal: 'withdrawals', rounds: 'rounds', ledger: 'ledger',
  get_settings: 'settings', save_settings: 'settings', admins: 'moderators', save_admin: 'moderators', delete_admin: 'moderators',
  broadcast: 'broadcast', broadcast_status: 'broadcast', audit: 'audit',
  force_list: 'settings', save_force: 'settings', delete_force: 'settings',
  tasks: 'tasks', save_task: 'tasks', delete_task: 'tasks',
}

// numeric/boolean/text settings the panel may write (validated; unknown keys are ignored by SQL as well)
const NUM = { welcome_bonus_pts: [0, 1000], adsgram_task_reward_pts: [0, 100], adsgram_int_reward_pts: [0, 100], adsgram_int_min_seconds: [3, 60], adsgram_int_cooldown_seconds: [5, 600], adsgram_int_daily_cap: [1, 1000], referral_reward_pts: [0, 1000], referral_ads_required: [0, 100], referral_required_tasks: [0, 100], min_bet_pts: [1, 1000], max_bet_pts: [1, 100000], max_payout_pts: [10, 10000000], points_per_usd: [1, 100000], min_withdrawal_pts: [1, 1000000], max_withdrawal_pts: [1, 10000000], withdrawal_ads_required: [0, 100], withdrawal_cooldown_hours: [0, 720], exchange_min_pts: [1, 10000000], exchange_max_pts: [1, 100000000], exchange_points_per_usdt: [1, 1000000] }
const BOOL = ['maintenance_mode', 'force_sub_enabled', 'registration_enabled', 'game_crash_enabled', 'game_mines_enabled', 'game_dice_enabled', 'game_blackjack_enabled', 'gram_enabled', 'binance_enabled', 'exchange_enabled']
const TEXT = { app_name: 60, gram_label: 40, payment_note: 300, support_username: 40, payment_channel: 60, welcome_text_ar: 1500, welcome_text_en: 1500 }

let broadcast = { running: false, sent: 0, failed: 0, total: 0, startedAt: 0 }

async function runBroadcast(text, actor) {
  broadcast = { running: true, sent: 0, failed: 0, total: 0, startedAt: Date.now() }
  let after = '0'
  try {
    for (;;) {
      const ids = await rpc('oddxs_broadcast_ids', { p_after: after, p_limit: 500 })
      if (!ids.length) break
      for (const id of ids) {
        broadcast.total++
        try { await telegramCall('sendMessage', { chat_id: id, text, disable_web_page_preview: true }); broadcast.sent++ }
        catch (e) { broadcast.failed++; if (e.code === 403) rpc('oddxs_mark_blocked', { p_tid: id }).catch(() => {}) }
        await new Promise((r) => setTimeout(r, 40))
      }
      after = ids[ids.length - 1]
    }
  } finally { broadcast.running = false; rpc('oddxs_audit', { p_actor: actor, p_action: 'broadcast', p_details: { sent: broadcast.sent, failed: broadcast.failed } }).catch(() => {}) }
}

export default async function admin(req, res) {
  try {
    const b = req.method === 'GET' ? { action: 'stats' } : (req.body || {})
    const action = clean(b.action, 40)
    if (!PERM[action]) return res.status(400).json({ error: 'Unknown admin action.' })
    const access = await requireAdmin(req, res, PERM[action])
    if (!access) return
    const { actorId, admin: me } = access

    switch (action) {
      case 'stats': return res.json({ ok: true, me: { id: actorId, role: me.role, permissions: me.permissions }, stats: await rpc('oddxs_admin_stats') })
      case 'users': return res.json({ ok: true, ...(await rpc('oddxs_admin_users', { p_q: clean(b.query, 60), p_limit: page(b).limit, p_offset: page(b).offset, p_sort: clean(b.sort, 10) || 'new' })) })
      case 'user_detail': return res.json({ ok: true, ...(await rpc('oddxs_admin_user_detail', { p_tid: clean(b.telegramId, 30) })) })
      case 'ban_user': {
        const tid = clean(b.telegramId, 30)
        if (!/^\d{5,20}$/.test(tid)) return res.status(400).json({ error: 'Invalid Telegram ID.' })
        await rpc('oddxs_admin_ban', { p_tid: tid, p_banned: b.banned === true, p_reason: clean(b.reason, 200), p_actor: actorId })
        return res.json({ ok: true })
      }
      case 'adjust_balance': {
        const tid = clean(b.telegramId, 30); const delta = Math.round(num(b.deltaPts) * 100)
        if (!/^\d{5,20}$/.test(tid) || !delta || Math.abs(delta) > 100_000_000) return res.status(400).json({ error: 'Enter a valid user ID and amount (points).' })
        return res.json({ ok: true, ...(await rpc('oddxs_admin_adjust', { p_tid: tid, p_delta_cp: delta, p_note: clean(b.note, 200), p_actor: actorId })) })
      }
      case 'withdrawals': return res.json({ ok: true, ...(await rpc('oddxs_admin_withdrawals', { p_status: clean(b.status, 10) || null, p_limit: page(b).limit, p_offset: page(b).offset })) })
      case 'review_withdrawal': {
        const act = b.review === 'approve' ? 'approve' : b.review === 'reject' ? 'reject' : ''
        if (!act) return res.status(400).json({ error: 'Invalid action.' })
        const w = await rpc('oddxs_review_withdrawal', { p_id: clean(b.id, 60), p_action: act, p_admin: actorId, p_note: clean(b.note, 300) || null, p_tx: clean(b.txRef, 200) || null })
        const pts = (w.amount_cp / 100).toFixed(0)
        const note = b.note ? `\n${escapeHtml(clean(b.note, 300))}` : ''
        await sendUserNotice(w.telegram_id, act === 'approve'
          ? `✅ <b>Withdrawal paid</b> · تم دفع سحبك\n${pts} pts → ${w.method === 'gram' ? 'Gram' : 'Binance ID'}${w.tx_ref ? `\nTx: <code>${escapeHtml(w.tx_ref)}</code>` : ''}${note}`
          : `❌ <b>Withdrawal rejected</b> · تم رفض السحب\n${pts} pts returned to your balance · أُعيدت النقاط لرصيدك${note}`)
        if (act === 'approve') {
          // public "payment proof" post, like SLY: user, amount, method, wallet
          try {
            const st = await rpc('oddxs_admin_settings').catch(() => ({}))
            const ch = String(st.payment_channel || process.env.PAYMENT_CHANNEL_ID || '').trim()
            if (ch) {
              const bot = await getBotUsername().catch(() => '')
              const who = w.username ? '@' + w.username : 'ID ' + w.telegram_id
              const text = `✅ <b>WITHDRAWAL APPROVED</b>\n\n👤 User: ${escapeHtml(who)}\n\n💰 <b>Amount</b>\n${Number(w.usd).toFixed(4)} USDT\n\n📤 <b>Payment Method</b>\n${w.method === 'gram' ? 'GRAM Wallet (TON)' : 'Binance ID'}\n\n💳 <b>Wallet Address</b>\n<code>${escapeHtml(w.target)}</code>\n\n🚀 Payment has been sent successfully.${bot ? `\n\n🤖 @${escapeHtml(bot)}` : ''}`
              await telegramCall('sendMessage', { chat_id: ch, text, parse_mode: 'HTML', disable_web_page_preview: true })
            }
          } catch (e) { console.warn('[ODDXS] payment channel post failed (is the bot an admin of the channel?):', e.message) }
        }
        return res.json({ ok: true, withdrawal: w })
      }
      case 'rounds': return res.json({ ok: true, ...(await rpc('oddxs_admin_rounds', { p_game: clean(b.game, 12) || null, p_tid: clean(b.telegramId, 30) || null, p_status: clean(b.status, 10) || null, p_limit: page(b).limit, p_offset: page(b).offset })) })
      case 'ledger': return res.json({ ok: true, ...(await rpc('oddxs_admin_ledger', { p_tid: clean(b.telegramId, 30) || null, p_kind: clean(b.kind, 20) || null, p_limit: page(b).limit, p_offset: page(b).offset })) })
      case 'audit': return res.json({ ok: true, ...(await rpc('oddxs_admin_audit', { p_limit: page(b).limit, p_offset: page(b).offset })) })
      case 'tasks': return res.json({ ok: true, tasks: await rpc('oddxs_admin_tasks') })
      case 'save_task': {
        const v = {}
        const id = clean(b.id, 40) || null
        if (id && !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Bad task id.' })
        const t = b.task || {}
        if (!id || t.title_en !== undefined) { v.title_en = clean(t.title_en, 100); if (!v.title_en) return res.status(400).json({ error: 'Task title is required.' }) }
        if (t.title_ar !== undefined) v.title_ar = clean(t.title_ar, 100)
        if (t.type !== undefined || !id) { v.type = t.type === 'channel' ? 'channel' : 'link' }
        if (t.url !== undefined || !id) { v.url = clean(t.url, 300); if (!/^https:\/\/(t\.me|telegram\.me)\/\S+$|^https:\/\/\S+\.\S+/.test(v.url)) return res.status(400).json({ error: 'Link must start with https://' }) }
        if (t.chat_id !== undefined) v.chat_id = clean(t.chat_id, 60)
        if (t.reward_pts !== undefined) v.reward_cp = Math.round(Math.min(10000, Math.max(0, num(t.reward_pts))) * 100)
        if (t.wait_seconds !== undefined) v.wait_seconds = Math.min(300, Math.max(0, Math.trunc(num(t.wait_seconds))))
        if (t.max_completions !== undefined) v.max_completions = t.max_completions === '' || t.max_completions === null ? '' : String(Math.max(1, Math.trunc(num(t.max_completions, 1))))
        if (t.is_active !== undefined) v.is_active = t.is_active === true
        if (t.sort !== undefined) v.sort = Math.trunc(num(t.sort))
        if ((v.type || t.type) === 'channel' && !(v.chat_id || t.chat_id)) { if (!id) return res.status(400).json({ error: 'Channel tasks need the @channel username.' }) }
        return res.json({ ok: true, task: await rpc('oddxs_admin_save_task', { p_id: id, p_v: v, p_actor: actorId }) })
      }
      case 'delete_task': {
        const id = clean(b.id, 40)
        if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Bad task id.' })
        return res.json({ ok: true, ...(await rpc('oddxs_admin_delete_task', { p_id: id, p_actor: actorId })) })
      }
      case 'force_list': return res.json({ ok: true, channels: await rpc('oddxs_force_list', { p_only_active: false }) })
      case 'save_force': {
        const id = clean(b.id, 40) || null
        if (id && !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Bad id.' })
        const c = b.channel || {}; const v = {}
        if (c.title !== undefined) v.title = clean(c.title, 80)
        if (c.chat_id !== undefined || !id) { v.chat_id = clean(c.chat_id, 60); if (!/^(@[A-Za-z0-9_]{4,}|-100\d{5,})$/.test(v.chat_id)) return res.status(400).json({ error: 'Channel ID must look like @channel or -100123456789.' }) }
        if (c.url !== undefined || !id) { v.url = clean(c.url, 300); if (!/^https:\/\/(t|telegram)\.me\/\S+$/.test(v.url)) return res.status(400).json({ error: 'Link must look like https://t.me/…' }) }
        if (c.is_active !== undefined) v.is_active = c.is_active === true
        if (c.sort !== undefined) v.sort = Math.trunc(num(c.sort))
        const out = await rpc('oddxs_admin_save_force', { p_id: id, p_v: v, p_actor: actorId }); invalidateForce()
        return res.json({ ok: true, channel: out })
      }
      case 'delete_force': {
        const id = clean(b.id, 40)
        if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Bad id.' })
        const out = await rpc('oddxs_admin_delete_force', { p_id: id, p_actor: actorId }); invalidateForce()
        return res.json({ ok: true, ...out })
      }
      case 'get_settings': return res.json({ ok: true, settings: await rpc('oddxs_admin_settings') })
      case 'save_settings': {
        const out = {}
        for (const [k, v] of Object.entries(b.settings || {})) {
          if (k in NUM) { const [lo, hi] = NUM[k]; out[k] = Math.min(hi, Math.max(lo, num(v, lo))) }
          else if (BOOL.includes(k)) out[k] = v === true || v === 'true'
          else if (k in TEXT) out[k] = clean(v, TEXT[k])
        }
        if (out.min_bet_pts && out.max_bet_pts && out.min_bet_pts > out.max_bet_pts) return res.status(400).json({ error: 'Min bet is higher than max bet.' })
        if (out.exchange_min_pts && out.exchange_max_pts && out.exchange_min_pts > out.exchange_max_pts) return res.status(400).json({ error: 'Minimum exchange is higher than maximum exchange.' })
        const saved = await rpc('oddxs_admin_save_settings', { p_values: out, p_actor: actorId })
        invalidateSettings()
        return res.json({ ok: true, settings: saved })
      }
      case 'admins': {
        if (!isOwner(me)) return res.status(403).json({ error: 'Only the owner can manage moderators.' })
        return res.json({ ok: true, admins: await rpc('oddxs_admin_list_admins'), permissions: ADMIN_PERMISSIONS })
      }
      case 'save_admin': {
        if (!isOwner(me)) return res.status(403).json({ error: 'Only the owner can manage moderators.' })
        const tid = clean(b.telegramId, 30); if (!/^\d{5,20}$/.test(tid)) return res.status(400).json({ error: 'Enter a numeric Telegram ID.' })
        const perms = [...new Set((Array.isArray(b.permissions) ? b.permissions : []).filter((p) => ADMIN_PERMISSIONS.includes(p)))]
        return res.json({ ok: true, admin: await rpc('oddxs_admin_save_admin', { p_tid: tid, p_perms: perms, p_actor: actorId }) })
      }
      case 'delete_admin': {
        if (!isOwner(me)) return res.status(403).json({ error: 'Only the owner can manage moderators.' })
        await rpc('oddxs_admin_delete_admin', { p_tid: clean(b.telegramId, 30), p_actor: actorId })
        return res.json({ ok: true })
      }
      case 'broadcast': {
        const text = clean(b.message, 3500); if (!text) return res.status(400).json({ error: 'Write a message first.' })
        if (broadcast.running) return res.status(409).json({ error: 'A broadcast is already running.' })
        runBroadcast(text, actorId).catch((e) => console.error('[ODDXS] broadcast:', e))
        return res.json({ ok: true, started: true })
      }
      case 'broadcast_status': return res.json({ ok: true, broadcast })
    }
  } catch (e) {
    console.error('[ODDXS] admin:', e)
    if (!res.headersSent) res.status(e.isDb ? 400 : 500).json({ error: e.isDb ? `${e.message}${e.detail ? ':' + e.detail : ''}` : 'Admin request failed.' })
  }
}
