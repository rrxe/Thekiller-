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
export async function buildMiniAppLink(startParam = 'home') {
  const bot = await getBotUsername()
  if (!bot) return ''
  const short = String(process.env.BOT_APP_SHORT_NAME || '').trim().replace(/^\/+|\/+$/g, '')
  return `https://t.me/${bot}${short ? '/' + short : ''}?startapp=${encodeURIComponent(String(startParam).slice(0, 64))}`
}
export const referralLink = async (tid) => `https://t.me/${await getBotUsername()}?start=ref_${tid}`

export async function sendUserNotice(tid, text, extra = {}) {
  try { await telegramCall('sendMessage', { chat_id: tid, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }); return true }
  catch (e) { console.warn('[ODDXS] notice failed:', e?.message || e); return false }
}
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
