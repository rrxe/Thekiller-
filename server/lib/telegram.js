export async function telegramCall(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    const e = new Error(data.description || `Telegram API error: ${res.status}`)
    e.code = data.error_code || res.status
    throw e
  }
  return data.result
}

let cachedUser = '', cachedAt = 0
export async function getBotUsername() {
  const configured = String(process.env.BOT_USERNAME || '').replace(/^@/, '').trim()
  if (configured && !/^your[_-]?bot/i.test(configured)) return configured
  if (cachedUser && Date.now() - cachedAt < 3600_000) return cachedUser
  const me = await telegramCall('getMe', {})
  cachedUser = String(me?.username || ''); cachedAt = Date.now()
  return cachedUser
}

/** https://t.me/<bot>[/<short>]?startapp=<param>  (needs the Mini App set in BotFather) */
// Direct Mini App link — fixed, no env vars or network calls needed, so it can never fail.
export const MINI_APP_DIRECT_LINK = 'https://t.me/ODDXS_BOT/odx'
export async function buildMiniAppLink(startParam = 'home') {
  const p = String(startParam || '').trim().slice(0, 64)
  // t.me/ODDXS_BOT/odx opens the Mini App inside Telegram; ?startapp= only passes the referral/deep-link payload.
  return p && p !== 'home' ? `${MINI_APP_DIRECT_LINK}?startapp=${encodeURIComponent(p)}` : MINI_APP_DIRECT_LINK
}
export const referralLink = async (tid) => `https://t.me/${await getBotUsername()}?start=ref_${tid}`

export async function sendUserNotice(tid, text, extra = {}) {
  try { await telegramCall('sendMessage', { chat_id: tid, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }); return true }
  catch (e) { console.warn('[ODDXS] notice failed:', e?.message || e); return false }
}
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])


/** Derive a getChatMember chat id from a public t.me link: https://t.me/name -> @name. Invite links (+hash / joinchat / c/) -> '' (cannot be derived). */
export function chatFromUrl(url) {
  const m = String(url || '').trim().match(/^https?:\/\/(?:t|telegram)\.me\/([A-Za-z][A-Za-z0-9_]{3,})\/?(?:[?#].*)?$/)
  if (!m) return ''
  if (/^(joinchat|addstickers|share|proxy|socks|c)$/i.test(m[1])) return ''
  return '@' + m[1]
}

/** Accepts @name, name, https://t.me/name, t.me/name or -100123… -> value usable as chat_id. Invite links (t.me/+…) return ''. */
export function normalizeChatRef(v) {
  const x = String(v || '').trim()
  if (!x) return ''
  if (/^-100\d{5,}$/.test(x) || /^@[A-Za-z][A-Za-z0-9_]{3,}$/.test(x)) return x
  const m = x.match(/^(?:https?:\/\/)?(?:t|telegram)\.me\/([A-Za-z][A-Za-z0-9_]{3,})\/?(?:[?#].*)?$/)
  if (m) return '@' + m[1]
  if (/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(x)) return '@' + x
  return ''
}
