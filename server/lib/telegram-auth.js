import crypto from 'node:crypto'

const token = () => String(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '').trim()

export function verifyTelegramInitData(initData) {
  if (!initData || typeof initData !== 'string' || !token()) return null
  try {
    const params = new URLSearchParams(initData)
    const received = String(params.get('hash') || '').toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(received)) return null
    params.delete('hash')
    const checkString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token()).digest()
    const expected = crypto.createHmac('sha256', secret).update(checkString).digest()
    const got = Buffer.from(received, 'hex')
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null

    const authDate = Number(params.get('auth_date') || 0)
    const now = Math.floor(Date.now() / 1000)
    const cfg = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS || 86400)
    const maxAge = Number.isFinite(cfg) ? Math.max(300, Math.min(cfg, 604800)) : 86400
    if (!authDate || authDate > now + 60 || now - authDate > maxAge) return null

    const user = JSON.parse(params.get('user') || 'null')
    if (!user?.id || !/^\d+$/.test(String(user.id))) return null
    return {
      id: String(user.id), username: user.username || null, firstName: user.first_name || 'Player',
      lastName: user.last_name || null, languageCode: user.language_code || null, startParam: params.get('start_param') || null,
    }
  } catch { return null }
}

export function getInitData(req) {
  const a = req.headers.authorization || ''
  if (typeof a === 'string' && a.startsWith('tga ')) return a.slice(4).trim()
  const h = req.headers['x-telegram-init-data']
  return typeof h === 'string' ? h.trim() : ''
}
export const authenticateRequest = (req) => verifyTelegramInitData(getInitData(req))
