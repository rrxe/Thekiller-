import crypto from 'node:crypto'
import { authenticateRequest } from './telegram-auth.js'
import { rpc } from './supabase.js'

export const ADMIN_PERMISSIONS = ['dashboard', 'users', 'withdrawals', 'rounds', 'ledger', 'settings', 'moderators', 'broadcast', 'audit']

const safeEq = (a, b) => {
  if (!a || !b) return false
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** Owner: ADMIN_SECRET in header `x-admin-secret` (same as SLY). Moderators: Telegram initData + oddxs_admins row. */
export async function requireAdmin(req, res, permission = 'dashboard') {
  if (safeEq(req.headers['x-admin-secret'], process.env.ADMIN_SECRET)) {
    const tg = authenticateRequest(req)
    return { actorId: tg?.id || 'owner', admin: { telegram_id: tg?.id || 'ADMIN_SECRET_OWNER', role: 'owner', permissions: ADMIN_PERMISSIONS } }
  }
  const tg = authenticateRequest(req)
  if (!tg) { res.status(401).json({ error: 'Enter ADMIN_SECRET, or open the app inside Telegram as an authorized moderator.' }); return null }
  const admin = await rpc('oddxs_admin_get', { p_tid: tg.id })
  if (!admin) { res.status(403).json({ error: 'Admin access required.' }); return null }
  const perms = Array.isArray(admin.permissions) ? admin.permissions : []
  if (admin.role !== 'owner' && permission !== 'dashboard' && !perms.includes(permission)) {
    res.status(403).json({ error: 'No permission for this section.' }); return null
  }
  return { actorId: tg.id, admin }
}
export const isOwner = (a) => a?.role === 'owner'
