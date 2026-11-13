import { telegramCall, buildMiniAppLink } from './telegram.js'
import { rpc } from './supabase.js'

const PATH = '/api/telegram/webhook'

export async function setupTelegramWebhook() {
  const webapp = process.env.WEBAPP_URL, secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!webapp || !secret) return console.warn('[ODDXS] WEBAPP_URL or TELEGRAM_WEBHOOK_SECRET missing — set the webhook manually.')
  await telegramCall('setWebhook', { url: `${new URL(webapp).origin}${PATH}`, secret_token: secret, allowed_updates: ['message'] })
  await telegramCall('setMyCommands', { commands: [{ command: 'start', description: 'Open ODDXS' }, { command: 'help', description: 'Help' }] })
  console.log('[ODDXS] Telegram webhook configured')
}

export async function handleTelegramWebhook(req, res) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).json({ ok: false })
  res.status(200).json({ ok: true }) // answer Telegram immediately

  try {
    const m = req.body?.message
    if (!m?.chat?.id || typeof m.text !== 'string') return
    const start = /^\/start(?:@\w+)?(?:\s+(.+))?$/i.exec(m.text.trim())
    const help = /^\/help(?:@\w+)?$/i.test(m.text.trim())
    if (!start && !help) return
    const ar = String(m.from?.language_code || '').toLowerCase().startsWith('ar')
    const settings = await rpc('oddxs_admin_settings')
    const text = String((ar ? settings.welcome_text_ar : settings.welcome_text_en) || '')
    const payload = start?.[1] ? String(start[1]).trim().slice(0, 64) : 'home'
    let url = ''
    try { url = await buildMiniAppLink(payload) } catch { /* fall back below */ }
    const button = url ? { text: ar ? 'افتح ODDXS 🎰' : 'Open ODDXS 🎰', url }
      : process.env.WEBAPP_URL ? { text: ar ? 'افتح ODDXS 🎰' : 'Open ODDXS 🎰', web_app: { url: process.env.WEBAPP_URL } } : null
    await telegramCall('sendMessage', { chat_id: m.chat.id, text, reply_markup: button ? { inline_keyboard: [[button]] } : undefined, disable_web_page_preview: true })
  } catch (e) { console.error('[ODDXS] webhook:', e?.message || e) }
}
