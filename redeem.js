import { supabase } from '../../lib/supabase.js'
import { authenticateRequest } from '../../lib/telegram-auth.js'

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const auth = authenticateRequest(req)

  if (!auth) {
    return res.status(401).json({ success: false, error: 'Invalid or missing Telegram authentication' })
  }

  const telegramId = auth.id

  try {
    const normalizedCode = normalizeCode(req.body?.code)

    if (!normalizedCode) {
      return res.status(400).json({ success: false, error: 'Gift code is required' })
    }

    const { data: giftCode, error: fetchError } = await supabase
      .from('gift_codes')
      .select('id, code, reward_coins, max_uses, current_uses, is_active')
      .eq('code', normalizedCode)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (!giftCode || !giftCode.is_active) {
      return res.status(404).json({ success: false, error: 'Invalid or inactive gift code' })
    }

    if (giftCode.current_uses >= giftCode.max_uses) {
      return res.status(400).json({ success: false, error: 'This gift code has reached its usage limit' })
    }

    // نحجز "مكان" لهذا المستخدم أولاً. القيد UNIQUE(code_id, telegram_id) بقاعدة
    // البيانات يمنع نفس المستخدم من استخدام نفس الكود مرتين، حتى لو ضغط
    // الزر بسرعة أو أرسل الطلب من جهازين بنفس الوقت.
    const { error: insertError } = await supabase
      .from('gift_code_redemptions')
      .insert({ code_id: giftCode.id, telegram_id: telegramId })

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(400).json({ success: false, error: 'You have already used this gift code' })
      }
      throw insertError
    }

    // نزيد current_uses بشرط إنه لسه بنفس القيمة اللي قرأناها. هذا الشرط
    // (optimistic locking) يمنع تجاوز max_uses حتى لو عشرات الأشخاص
    // استخدموا نفس الكود بنفس اللحظة بالضبط.
    const { data: updatedCode, error: updateError } = await supabase
      .from('gift_codes')
      .update({ current_uses: giftCode.current_uses + 1 })
      .eq('id', giftCode.id)
      .eq('current_uses', giftCode.current_uses)
      .select()
      .maybeSingle()

    if (updateError) throw updateError

    if (!updatedCode) {
      // خسرنا السباق - شخص ثاني أخذ آخر مكان بين قراءتنا وكتابتنا.
      // نتراجع عن الحجز حتى ما يُحسب استخدام على هذا المستخدم بدون مكافأة.
      await supabase
        .from('gift_code_redemptions')
        .delete()
        .eq('code_id', giftCode.id)
        .eq('telegram_id', telegramId)

      return res.status(400).json({ success: false, error: 'This gift code has reached its usage limit' })
    }

    const { data: player, error: playerFetchError } = await supabase
      .from('players')
      .select('coin')
      .eq('telegram_id', telegramId)
      .single()

    if (playerFetchError || !player) {
      return res.status(404).json({ success: false, error: 'Player not found' })
    }

    const rewardCoins = Number(giftCode.reward_coins || 0)
    const newCoins = Number(player.coin || 0) + rewardCoins

    const { error: coinUpdateError } = await supabase
      .from('players')
      .update({ coin: newCoins })
      .eq('telegram_id', telegramId)

    if (coinUpdateError) throw coinUpdateError

    return res.status(200).json({
      success: true,
      coins: newCoins,
      rewardCoins,
      remainingUses: Math.max(0, updatedCode.max_uses - updatedCode.current_uses),
    })
  } catch (err) {
    console.error('gift-codes/redeem error:', err)
    return res.status(500).json({ success: false, error: err.message })
  }
}
