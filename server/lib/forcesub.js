// Forced subscription: the user must be a member of every active channel (bot must be admin there).
import { rpc } from './supabase.js'
import { telegramCall } from './telegram.js'

let chCache = { at: 0, list: [] }
async function channels() {
  if (Date.now() - chCache.at < 15000) return chCache.list
  chCache = { at: Date.now(), list: await rpc('oddxs_force_list', { p_only_active: true }) }
  return chCache.list
}
export const invalidateForce = () => { chCache.at = 0 }

const okCache = new Map() // tid -> expiry ms (only positive results are cached)
async function isMember(c, tid) {
  try {
    const m = await telegramCall('getChatMember', { chat_id: c.chat_id, user_id: Number(tid) })
    return ['member', 'administrator', 'creator'].includes(m?.status) || (m?.status === 'restricted' && m.is_member === true)
  } catch (e) {
    // misconfiguration (bot not admin / wrong chat id) must not lock everybody out
    console.error(`[ODDXS] force-sub check failed for ${c.chat_id}: ${e.message} — is the bot an admin of that channel?`)
    return true
  }
}

/** -> { enabled, ok, missing:[{id,title,url}] } */
export async function forceStatus(tid, enabled = true) {
  if (!enabled) return { enabled: false, ok: true, missing: [] }
  const list = await channels()
  if (!list.length) return { enabled: true, ok: true, missing: [] }
  if ((okCache.get(tid) || 0) > Date.now()) return { enabled: true, ok: true, missing: [] }
  const res = await Promise.all(list.map(async (c) => ((await isMember(c, tid)) ? null : { id: c.id, title: c.title, url: c.url })))
  const missing = res.filter(Boolean)
  if (!missing.length) okCache.set(tid, Date.now() + 60_000)
  else okCache.delete(tid)
  return { enabled: true, ok: !missing.length, missing }
}
export const forgetForce = (tid) => okCache.delete(tid)
