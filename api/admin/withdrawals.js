import { supabase } from '../../lib/supabase.js'

export default async function handler(req, res) {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('telegram_id, username, usdt_balance, wallet_address, withdrawal_status, withdrawal_amount, withdrawal_method, withdrawal_target, withdrawal_bnb_amount, withdrawal_bnb_price_usd')
        .eq('withdrawal_status', 'pending')

      if (error) throw error

      const formatted = data.map((p) => ({
        id: p.telegram_id,
        telegram_id: p.telegram_id,
        username: p.username || 'NoUsername',
        amount_usdt: p.withdrawal_amount,
        method: p.withdrawal_method || 'bnb',
        target: p.withdrawal_target || p.wallet_address,
        bnb_amount: p.withdrawal_bnb_amount,
        bnb_price_usd: p.withdrawal_bnb_price_usd,
        status: p.withdrawal_status ? p.withdrawal_status.toUpperCase() : 'PENDING',
      }))

      return res.status(200).json(formatted)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  res.setHeader('Allow', ['GET'])
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
}
