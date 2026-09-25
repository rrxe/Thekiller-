import { supabase } from '../../lib/supabase.js'

// ============================================================
// ليش البرودكاست كان "غبي" وما يوصل لكل اللاعبين + الصورة ما ترسل:
//
// 1) الصورة ما ترسل: body-parser بالسيرفر (express.json) إله حد
//    افتراضي 100kb للطلب. أي صورة محوّلة base64 أكبر من هيك تنرفض
//    كاملة قبل لا توصل حتى لهالملف. (الحل بملف server.js: رفعنا
//    الحد لـ 15mb).
//
// 2) ما يوصل لكل اللاعبين: الاستعلام كان `select('telegram_id')`
//    بدون أي pagination. مكتبة Supabase تحدد تلقائياً أقصى 1000 صف
//    بكل استعلام. يعني لو عندك أكثر من 1000 لاعب، أي حد فوق الـ 1000
//    ما كان يوصله البرودكاست أبداً - بصمت وبدون أي خطأ ظاهر.
//
// 3) التصميم القديم كان مبني على افتراض إنه شغال على Vercel serverless
//    (حد 10 ثواني بالضبط للدالة)، فكان يعتمد على إن واجهة الأدمن تضل
//    فاتحة الصفحة وتستدعي نفس الـ endpoint عشرات المرات (offset تلو
//    offset) لين يخلص. لو الأدمن سكر التاب أو انقطع النت بالنص،
//    البرودكاست يوقف للأبد بدون أي طريقة يكمل فيها.
//    بما إن المشروع الحين يشتغل بسيرفر Node/Express دائم (مو serverless
//    مؤقت)، ما فيه داعي لكل هالتعقيد. صرنا نسوي كل شي بطلب وحد:
//    - الأدمن يضغط "إرسال للجميع" مرة وحدة بس
//    - السيرفر يرد فوراً "بدأ الإرسال" ويكمل الإرسال بالخلفية
//    - واجهة الأدمن تستعلم كل شوي عن حالة التقدم (progress) وتعرضها
//
// 4) (إصلاح إضافي) "فيه إرسال جماعي شغال حالياً" بدون أي إرسال فعلي:
//    لو أي طلب شبكة وحد (لتيليجرام أو Supabase) تعلّق بدون ما يرجع
//    رد ولا خطأ (تجمّد كامل، مو مجرد بطء)، الحلقة توقف بالنص للأبد
//    وأبداً ما توصل لـ finally اللي يصفّر state.active. فيضل عالق
//    true للأبد ويرفض أي محاولة إرسال جديدة بعدها. الحل:
//    - كل طلب شبكة إله مهلة قصوى (AbortController) فيرجع فشل بدل
//      ما يعلّق للأبد
//    - شبكة أمان إضافية: لو ما فيه أي تقدم لمدة أطول من المعقول،
//      نعتبر الحالة "عالقة" ونصفّرها تلقائياً بأول طلب جديد يجي
// ============================================================

const BATCH_SIZE = 30 // حد تيليجرام الفعلي (~30 رسالة/ثانية لمستخدمين مختلفين)
const BATCH_INTERVAL_MS = 1000 // طول النافذة الزمنية المستهدفة للدفعة، مو انتظار إضافي فوقها
const REQUEST_TIMEOUT_MS = 10000 // أقصى وقت ننتظره لأي طلب شبكة وحد
const STALL_RESET_MS = 90000 // لو مافيه أي تقدم لهالمدة، نعتبرها عالقة

// حالة البرودكاست الحالية، محفوظة بالذاكرة طول ما السيرفر شغال
// (يشتغل صح لأن هذا سيرفر Node دائم، مو دالة serverless تتصفر كل طلب)
const state = {
  active: false,
  sentCount: 0,
  failedCount: 0,
  totalPlayers: 0,
  processedSoFar: 0,
  done: true,
  error: null,
  startedAt: null,
  finishedAt: null,
  lastProgressAt: null,
}

function publicState() {
  return {
    active: state.active,
    sentCount: state.sentCount,
    failedCount: state.failedCount,
    totalPlayers: state.totalPlayers,
    processedSoFar: state.processedSoFar,
    done: state.done,
    error: state.error,
  }
}

// لو الحالة تقول "شغال" بس ما صار فيها أي تقدم لمدة أطول من المعقول،
// أكيد فيه طلب شبكة تعلّق للأبد بمكان ما. نعتبرها عالقة ونصفّرها
// عشان الأدمن يقدر يبدأ إرسال جديد بدل ما يضل محظور للأبد.
function clearIfStalled() {
  if (!state.active) return

  const reference = state.lastProgressAt || state.startedAt || 0
  if (Date.now() - reference > STALL_RESET_MS) {
    state.active = false
    state.done = true
    state.error = 'توقف الإرسال بسبب تعليق بالشبكة (Timeout) وتم إعادة الضبط تلقائياً.'
    state.finishedAt = Date.now()
  }
}

// يضيف مهلة قصوى لأي فيتش عشان ما يعلّق للأبد لو الشبكة تجمّدت
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// يجيب كل اللاعبين بدون أي حد أقصى، بصفحات من 1000 بالتتابع
// (هذا هو الحل لمشكلة الـ 1000 صف)، مع مهلة قصوى على كل صفحة
async function fetchAllTelegramIds() {
  const ids = []
  const PAGE_SIZE = 1000
  let from = 0

  while (true) {
    const pageQuery = supabase
      .from('players')
      .select('telegram_id')
      .order('telegram_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('انتهت مهلة الاتصال بقاعدة البيانات')), REQUEST_TIMEOUT_MS)
    })

    const { data, error } = await Promise.race([pageQuery, timeoutPromise])

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      ids.push(row.telegram_id)
    }

    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return ids
}

async function sendOne(telegramId, botToken, message, photoBuffer, photoMime, replyMarkup) {
  try {
    let response

    if (photoBuffer) {
      const form = new FormData()
      form.append('chat_id', String(telegramId))
      if (message) {
        form.append('caption', message)
        form.append('parse_mode', 'HTML')
      }
      if (replyMarkup) {
        form.append('reply_markup', JSON.stringify(replyMarkup))
      }
      form.append(
        'photo',
        new Blob([photoBuffer], { type: photoMime || 'image/jpeg' }),
        'broadcast.jpg'
      )

      response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        body: form,
      })
    } else {
      response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text: message,
          parse_mode: 'HTML',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      })
    }

    const result = await response.json()
    return !!result.ok
  } catch (e) {
    // نتجاوز أي رسالة فشلت (مثلاً مستخدم حظر البوت أو تجاوزت المهلة) ونكمل الباقي
    return false
  }
}

async function runBroadcast(message, photoBuffer, photoMime, linkUrl, linkText) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const replyMarkup = linkUrl
    ? { inline_keyboard: [[{ text: linkText || 'فتح الرابط', url: linkUrl }]] }
    : null

  try {
    const telegramIds = await fetchAllTelegramIds()
    state.totalPlayers = telegramIds.length
    state.lastProgressAt = Date.now()

    for (let i = 0; i < telegramIds.length; i += BATCH_SIZE) {
      const batch = telegramIds.slice(i, i + BATCH_SIZE)
      const batchStartedAt = Date.now()

      const results = await Promise.allSettled(
        batch.map((id) => sendOne(id, botToken, message, photoBuffer, photoMime, replyMarkup))
      )

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          state.sentCount += 1
        } else {
          state.failedCount += 1
        }
      }

      state.processedSoFar += batch.length
      state.lastProgressAt = Date.now()

      const isLastBatch = i + BATCH_SIZE >= telegramIds.length
      if (!isLastBatch) {
        // ننتظر بس الوقت المتبقي لإكمال ثانية واحدة منذ بداية الدفعة،
        // مو ثانية كاملة إضافية فوق وقت الإرسال الفعلي. قبل هذا التعديل
        // كنا نستنى 1000ms إضافية دايماً حتى لو الإرسال نفسه أخذ وقت،
        // وهذا كان يضيّع نص السرعة المسموحة تقريباً بلا داعي.
        const elapsedMs = Date.now() - batchStartedAt
        const remainingMs = BATCH_INTERVAL_MS - elapsedMs
        if (remainingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingMs))
        }
      }
    }
  } catch (err) {
    state.error = err.message || 'حدث خطأ أثناء الإرسال'
  } finally {
    state.active = false
    state.done = true
    state.finishedAt = Date.now()
  }
}

export default async function handler(req, res) {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  // قبل أي شي، نتأكد إن الحالة "شغال" مو مجرد بقايا عالقة من طلب
  // شبكة تجمّد سابقاً
  clearIfStalled()

  // استعلام عن حالة التقدم الحالية (تستخدمه واجهة الأدمن كل ثانية ونص
  // لتحديث الشريط لين ما يخلص الإرسال)
  if (req.method === 'GET') {
    return res.status(200).json({ success: true, ...publicState() })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const forceReset = !!(req.body && req.body.forceReset)

  if (state.active && !forceReset) {
    return res.status(409).json({
      success: false,
      error: 'فيه إرسال جماعي شغال حالياً، انتظر لين يخلص قبل ما تبدأ وحدة جديدة.',
    })
  }

  try {
    const { message, photoBase64, photoMime, linkUrl, linkText } = req.body || {}

    if (!message && !photoBase64) {
      return res.status(400).json({ success: false, error: 'Message or photo is required' })
    }

    let photoBuffer = null
    if (photoBase64) {
      try {
        photoBuffer = Buffer.from(photoBase64, 'base64')
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid photo data' })
      }
    }

    // نصفّر الحالة ونبدأ الإرسال بالخلفية بدون ما ننتظره (fire-and-forget)،
    // ونرد فوراً على الأدمن حتى ما يعلّق الطلب
    state.active = true
    state.sentCount = 0
    state.failedCount = 0
    state.totalPlayers = 0
    state.processedSoFar = 0
    state.done = false
    state.error = null
    state.startedAt = Date.now()
    state.finishedAt = null
    state.lastProgressAt = Date.now()

    runBroadcast(message, photoBuffer, photoMime, linkUrl, linkText)

    return res.status(200).json({ success: true, started: true, ...publicState() })
  } catch (err) {
    state.active = false
    state.done = true
    return res.status(500).json({ success: false, error: err.message })
  }
}
