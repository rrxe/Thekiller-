import { supabase } from '../lib/supabase.js'
import { authenticateRequest } from '../lib/telegram-auth.js'
import { logLedger } from '../lib/ledger.js'

// هذا الملف ما كان موجود إطلاقاً بمشروعك. صفحة ExchangeModal بالفرونت
// اند كانت تحسب التحويل من Coins إلى USDT محلياً بالمتصفح فقط
// (localStorage) وما ترسل أي شي للسيرفر - يعني رصيد الـ USDT اللي
// يشوفه اللاعب وهمي بالكامل وما ينخزن بقاعدة البيانات أبداً.

const RATE = 0.0000025
const MIN_COINS = 1000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = authenticateRequest(req)
  if (!auth) return res.status(401).json({ error: 'Invalid or missing Telegram authentication' })

  const telegramId = auth.id

  try {
    const { amountCoins } = req.body || {}
    const amount = Math.floor(Number(amountCoins))

    if (!Number.isFinite(amount) || amount < MIN_COINS) {
      return res.status(400).json({ error: `Minimum exchange is ${MIN_COINS} coins` })
    }

    const { data: player, error: fetchError } = await supabase
      .from('players')
      .select('coin, usdt_balance')
      .eq('telegram_id', telegramId)
      .single()

    if (fetchError || !player) return res.status(404).json({ error: 'Player not found' })

    if ((player.coin || 0) < amount) {
      return res.status(400).json({ error: 'Insufficient coin balance' })
    }

    const usdtGained = Number((amount * RATE).toFixed(4))
    const newCoins = (player.coin || 0) - amount
    const newUsdt = Number(((player.usdt_balance || 0) + usdtGained).toFixed(4))

    const { error: updateError } = await supabase
      .from('players')
      .update({ coin: newCoins, usdt_balance: newUsdt })
      .eq('telegram_id', telegramId)

    if (updateError) throw updateError

    await logLedger(telegramId, 'exchange', {
      coins: -amount,
      usdt: usdtGained,
      detail: 'تحويل عملات إلى USDT',
      balanceAfter: newCoins,
    })

    return res.status(200).json({ success: true, coins: newCoins, usdtBalance: newUsdt, usdtGained })
  } catch (err) {
    console.error('exchange error:', err)
    return res.status(500).json({ error: err.message })
  }
}
