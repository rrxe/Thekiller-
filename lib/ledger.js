import { supabase } from './supabase.js'

// سجل الكسب: أي فشل هون ما لازم يكسر العملية الأساسية.
export async function logLedger(telegramId, source, opts = {}) {
  try {
    const coins = Math.round(Number(opts.coins) || 0)
    const usdt = Number((Number(opts.usdt) || 0).toFixed(6))
    if (!coins && !usdt) return

    const balanceAfter =
      opts.balanceAfter === null || opts.balanceAfter === undefined
        ? null
        : Math.round(Number(opts.balanceAfter))

    const { error } = await supabase.from('coin_ledger').insert({
      telegram_id: String(telegramId),
      source,
      coins_delta: coins,
      usdt_delta: usdt,
      balance_after: Number.isFinite(balanceAfter) ? balanceAfter : null,
      detail: opts.detail ? String(opts.detail).slice(0, 120) : null,
    })

    if (error) console.error('[ledger] insert failed:', error.message)
  } catch (err) {
    console.error('[ledger] failed:', err)
  }
}
