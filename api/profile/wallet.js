import { supabase } from '../../lib/supabase.js'
import { authenticateRequest } from '../../lib/telegram-auth.js'

const TON_PATTERN = /^(-?[0-9]:[a-fA-F0-9]{64}|[A-Za-z0-9_-]{48})$/

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = authenticateRequest(req)
  if (!auth) return res.status(401).json({ error: 'Invalid or missing Telegram authentication' })

  const telegramId = auth.id

  try {
    const { walletAddress } = req.body || {}

    // نسمح بـ null لفك ربط المحفظة، لكن أي قيمة نصية لازم تكون عنوان TON (GRAM) صحيح
    if (walletAddress !== null && walletAddress !== undefined && !TON_PATTERN.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid TON wallet address' })
    }

    const { error: updateError } = await supabase
      .from('players')
      .update({ wallet_address: walletAddress ?? null })
      .eq('telegram_id', telegramId)

    if (updateError) throw updateError

    return res.status(200).json({ success: true, walletAddress: walletAddress ?? null })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
