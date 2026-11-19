// AdsGram server-to-server reward callback validation.
// AdsGram calls your Reward URL after a user completes a Task block:
//   GET https://YOUR-DOMAIN/api/auth/me?userid=[userId]&secret=YOUR_SECRET&kind=native_task
import crypto from 'node:crypto'

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest()

/** constant-time secret comparison (hashing equalises lengths) */
export function secretMatches(given) {
  const expected = String(process.env.ADSGRAM_REWARD_SECRET || '')
  if (!expected || typeof given !== 'string' || !given) return false
  return crypto.timingSafeEqual(sha(given), sha(expected))
}

/** returns { ok, status, tid } — never throws, never logs the secret */
export function validateAdsgramCallback(query) {
  if (!process.env.ADSGRAM_REWARD_SECRET) return { ok: false, status: 503, error: 'not_configured' } // fail closed
  if (!secretMatches(query.secret)) return { ok: false, status: 403, error: 'forbidden' }
  const tid = String(query.userid ?? query.userId ?? '')
  if (!/^\d{5,20}$/.test(tid)) return { ok: false, status: 400, error: 'bad_user' }
  if (String(query.kind || '') !== 'native_task') return { ok: false, status: 400, error: 'bad_kind' }
  return { ok: true, tid }
}
