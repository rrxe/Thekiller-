import { supabase } from '../../../lib/supabase.js'
import { logLedger } from '../../../lib/ledger.js'

// استدعيه من admin.html بـ:
//   POST /api/admin/withdrawals/status
//   headers: { "x-admin-secret": "...", "Content-Type": "application/json" }
//   body: { "telegramId": 123456789, "action": "approve" | "reject" }

const APP_DEEP_LINK = 'https://t.me/SLYMintX_bot/start'
const PAYMENT_PROOF_CHANNEL = '@SLYMintX_payment'

// يرسل إشعار تيليجرام للاعب بعد الموافقة على السحب، مع زر
// "Continue Farming" يرجعه مباشرة للتطبيق. فشل الإرسال (مثلاً
// المستخدم حاظر البوت) لا يوقف عملية الموافقة نفسها - نسجل الخطأ بس.
async function sendApprovalNotification(telegramId, { amount, method, target, bnbAmount, username }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.error('sendApprovalNotification: TELEGRAM_BOT_TOKEN missing')
    return
  }

  const methodLabel = method === 'binance' ? 'Binance ID' : 'GRAM Wallet (TON)'
  const targetLine =
    method === 'binance'
      ? `Binance ID: <code>${escapeHtml(String(target))}</code>`
      : `Wallet: <code>${escapeHtml(String(target))}</code>`

  const bnbLine =
    method === 'bnb' && bnbAmount
      ? `\n≈ ${Number(bnbAmount).toFixed(8)} GRAM`
      : ''

  const text =
    `✅ <b>Withdrawal Approved!</b>\n\n` +
    `💰 Amount: <b>${Number(amount).toFixed(4)} USDT</b>${bnbLine}\n` +
    `📤 Method: ${methodLabel}\n` +
    `${targetLine}\n\n` +
    `Your funds are on the way. Thanks for playing! 🚀`

  const displayName = username
    ? `@${escapeHtml(String(username))}`
    : `Player #${String(telegramId).slice(-4)}`

  const channelText =
    `✅ <b>WITHDRAWAL APPROVED</b>\n\n` +
    `👤 <b>User:</b> ${displayName}\n\n` +
    `💰 <b>Amount</b>\n` +
    `<b>${Number(amount).toFixed(4)} USDT</b>${bnbLine}\n\n` +
    `📤 <b>Payment Method</b>\n` +
    `${methodLabel}\n\n` +
    `💳 <b>Wallet Address</b>\n` +
    `<code>${escapeHtml(String(target || '—'))}</code>\n\n` +
    `🚀 <b>Payment has been sent successfully.</b>`

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🌱 Continue Farming',
                url: APP_DEEP_LINK,
              },
            ],
          ],
        },
      }),
    })
  } catch (err) {
    console.error('sendApprovalNotification failed:', err)
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: PAYMENT_PROOF_CHANNEL,
        text: channelText,
        parse_mode: 'HTML',
      }),
    })
  } catch (err) {
    console.error('sendApprovalNotification (channel) failed:', err)
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default async function handler(req, res) {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { telegramId, action } = req.body || {}

    if (!telegramId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request' })
    }

    const { data: player, error: fetchError } = await supabase
      .from('players')
      .select('usdt_balance, withdrawal_amount, withdrawal_status, withdrawal_method, withdrawal_target, withdrawal_bnb_amount, username')
      .eq('telegram_id', telegramId)
      .single()

    if (fetchError || !player) {
      return res.status(404).json({ error: 'Player not found' })
    }

    if (player.withdrawal_status !== 'pending') {
      return res.status(400).json({ error: 'No pending withdrawal for this player' })
    }

    if (action === 'approve') {
      // نحتفظ بتفاصيل الطلب قبل تصفيرها، عشان نستخدمها بالإشعار
      const amount = player.withdrawal_amount || 0
      const method = player.withdrawal_method || 'bnb'
      const target = player.withdrawal_target || ''
      const bnbAmount = player.withdrawal_bnb_amount || null

      // الموافقة: تصفير الطلب لأن المبلغ صار المفروض يترسل يدوياً للاعب
      const { error } = await supabase
        .from('players')
        .update({ withdrawal_status: 'completed', withdrawal_amount: 0 })
        .eq('telegram_id', telegramId)

      if (error) throw error

      // نحدث سجل الـ pending الوحيد لهذا اللاعب لحالة completed حتى
      // يشوف اللاعب التحديث بصفحة البروفايل (اللاعب ما يقدر يسوي أكثر
      // من طلب pending وحد بنفس الوقت أصلاً - محظور من withdraw.js)
      await supabase
        .from('withdrawal_history')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('telegram_id', telegramId)
        .eq('status', 'pending')

      // إرسال الإشعار بعد نجاح التحديث بقاعدة البيانات
      await sendApprovalNotification(telegramId, {
        amount,
        method,
        target,
        bnbAmount,
        username: player.username || null,
      })

      return res.status(200).json({ success: true, status: 'completed' })
    }

    // الرفض: إعادة المبلغ تلقائياً لرصيد usdt_balance الخاص باللاعب
    const refundedBalance = Number(
      ((player.usdt_balance || 0) + (player.withdrawal_amount || 0)).toFixed(4)
    )

    const { error } = await supabase
      .from('players')
      .update({
        usdt_balance: refundedBalance,
        withdrawal_status: 'rejected',
        withdrawal_amount: 0,
      })
      .eq('telegram_id', telegramId)

    if (error) throw error

    await logLedger(telegramId, 'withdrawal_refund', {
      usdt: Number(player.withdrawal_amount || 0),
      detail: 'سحب مرفوض - رجع الرصيد',
    })

    await supabase
      .from('withdrawal_history')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('telegram_id', telegramId)
      .eq('status', 'pending')

    return res.status(200).json({
      success: true,
      status: 'rejected',
      usdtBalance: refundedBalance,
    })
  } catch (err) {
    console.error('withdrawals/status error:', err)
    return res.status(500).json({ error: err.message })
  }
}
