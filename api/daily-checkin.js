import { supabase } from '../lib/supabase.js'
import { authenticateRequest } from '../lib/telegram-auth.js'
import { logLedger } from '../lib/ledger.js'

// المشكلة الأصلية: هذا الملف كان يتوقع telegramId جوه body الطلب، بس
// الفرونت اند (Home.tsx) يرسل initData جوه هيدر Authorization فقط ولا
// يرسل أي body فيه telegramId. النتيجة: كل ضغطة "Claim" كانت ترجع
// خطأ 400 "Telegram ID is required" دائماً ولا يشتغل تسجيل الحضور أبداً.
// صار الحل: نستخرج ونتحقق من telegram_id من initData متل باقي الملفات.

const DAILY_REWARD = 250

function utcDayNumber(date) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000)
}

function isSameUtcDay(dateA, dateB) {
  return utcDayNumber(dateA) === utcDayNumber(dateB)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Invalid or missing Telegram authentication' })
  }

  const telegramId = auth.id

  try {
    let { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    if (!player) {
      const { data: created, error: insertError } = await supabase
        .from('players')
        .insert([{ telegram_id: telegramId, username: auth.username, coin: 0, usdt_balance: 0 }])
        .select()
        .single()

      if (insertError) throw insertError
      player = created
    }

    const now = new Date()

    if (player.last_checkin && isSameUtcDay(new Date(player.last_checkin), now)) {
      return res.status(400).json({ success: false, error: 'You already claimed today.' })
    }

    // تصحيح: نحسب الفرق باليوم التقويمي (UTC) مو بفرق الساعات الخام.
    // قبل هذا التعديل diffDays كانت تحسب (now - last_checkin) / 24 ساعة
    // بالمللي ثانية، فلو المستخدم سجل قريب من منتصف الليل (مثلاً 23:58
    // أمس و 00:05 اليوم) كان الفرق الفعلي أقل من ساعة، يعني diffDays=0
    // مو 1 - فيصفر الستريك غلط بدل ما يزيده رغم إنه يوم تقويمي جديد فعلاً.
    let newStreak = 1
    if (player.last_checkin) {
      const diffDays = utcDayNumber(now) - utcDayNumber(new Date(player.last_checkin))
      newStreak = diffDays === 1 ? (player.streak || 0) + 1 : 1
    }

    const newCoins = (player.coin || 0) + DAILY_REWARD

    const { data: updated, error: updateError } = await supabase
      .from('players')
      .update({ coin: newCoins, last_checkin: now.toISOString(), streak: newStreak })
      .eq('telegram_id', telegramId)
      .select()
      .single()

    if (updateError) throw updateError

    await logLedger(telegramId, 'daily_checkin', {
      coins: DAILY_REWARD,
      detail: `سلسلة ${newStreak} يوم`,
      balanceAfter: newCoins,
    })

    return res.status(200).json({
      success: true,
      coins: updated.coin,
      streak: newStreak,
      reward: DAILY_REWARD,
    })
  } catch (err) {
    console.error('daily-checkin error:', err)
    return res.status(500).json({ error: err.message })
  }
}
