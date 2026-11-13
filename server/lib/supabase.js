import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) console.error('[ODDXS] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

// Service-role client: it only ever calls the oddxs_* SQL functions (see sql/oddxs_full.sql).
export const supabase = createClient(url || 'https://example.supabase.co', key || 'missing-service-role-key', {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** call an SQL function, throw Error(code) on failure (codes come from `raise exception 'code'` in SQL) */
export async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    const message = String(error.message || 'db_error')
    const e = new Error(message.split(':')[0])
    e.detail = message.includes(':') ? message.split(':').slice(1).join(':') : undefined
    e.isDb = true
    throw e
  }
  return data
}
