import crypto from 'crypto'

/**
 * يتحقق من صحة initData القادمة من Telegram Mini App عن طريق مقارنة الـ hash
 * الموقّع بمفتاح البوت (TELEGRAM_BOT_TOKEN). هذا يمنع أي شخص من تزوير
 * telegram_id وانتحال شخصية لاعب آخر عن طريق تعديل الطلب يدوياً.
 *
 * مهم: initData ما تكون موجودة أبداً إلا لو التطبيق مفتوح فعلياً من داخل
 * تطبيق تيليجرام (عن طريق زر البوت أو رابط t.me/...). فتح الرابط بمتصفح
 * عادي (Chrome/Safari) بدون تيليجرام يخلي initData فاضية دائماً، وبالتالي
 * ما تكدر تجيب telegram_id - هذا طبيعي وليس خطأ بالكود.
 */
export function verifyTelegramInitData(initData) {
  if (!initData) return null

  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
  if (!botToken) {
    console.error('[telegram-auth] TELEGRAM_BOT_TOKEN أو BOT_TOKEN غير مضبوط بمتغيرات البيئة')
    return null
  }

  try {
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash')
    if (!hash) return null

    urlParams.delete('hash')

    const pairs = []
    for (const [key, value] of urlParams.entries()) {
      pairs.push(`${key}=${value}`)
    }
    pairs.sort()
    const dataCheckString = pairs.join('\n')

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (computedHash !== hash) {
      console.error('[telegram-auth] hash mismatch - initData قد تكون مزورة أو BOT التوكن خطأ')
      return null
    }

    // تجاهل initData القديمة جداً (أكثر من 24 ساعة) كإجراء أمان إضافي
    const authDate = Number(urlParams.get('auth_date') || 0)
    const now = Math.floor(Date.now() / 1000)
    if (authDate && now - authDate > 24 * 60 * 60) {
      console.error('[telegram-auth] initData منتهية الصلاحية')
      return null
    }

    const userStr = urlParams.get('user')
    if (!userStr) return null

    const user = JSON.parse(userStr)
    if (!user?.id) return null

    return {
      id: user.id,
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      photoUrl: user.photo_url || null,
      startParam: urlParams.get('start_param') || null,
    }
  } catch (err) {
    console.error('[telegram-auth] فشل التحقق من initData:', err)
    return null
  }
}

/** يسحب initData من هيدر Authorization بصيغة "tga <initData>" */
export function getInitDataFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || ''
  if (!authHeader.startsWith('tga ')) return ''
  return authHeader.slice(4)
}

/** دالة جاهزة: تتحقق من الطلب كامل وترجع بيانات المستخدم أو null */
export function authenticateRequest(req) {
  const initData = getInitDataFromRequest(req)
  return verifyTelegramInitData(initData)
}
