import { supabase } from '../lib/supabase.js'
import { authenticateRequest } from '../lib/telegram-auth.js'

const MAX_RUNNER_SCORE = 200000

// أي طلب جاي بـ header x-admin-secret صحيح يتعامل معه كطلب أدمن
function isAdminRequest(req) {
  const secret = req.headers['x-admin-secret']
  return Boolean(secret && process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET)
}

// اللوحة القديمة (الأكثر عملات) - ما تغيرت
async function handleCoinLeaderboard(req, res) {
  const { data: players, error } = await supabase
    .from('players')
    .select('telegram_id, username, coin')
    .order('coin', { ascending: false })
    .limit(10)

  if (error) throw error

  const formatted = (players || []).map((player, index) => {
    const coins = player.coin || 0
    let tier = 'Common'
    if (coins >= 10000) tier = 'Mythic'
    else if (coins >= 5000) tier = 'Legendary'
    else if (coins >= 1000) tier = 'Epic'

    return {
      rank: index + 1,
      name: player.username ? `@${player.username}` : `Player_${String(player.telegram_id).slice(-4)}`,
      coins: coins.toLocaleString(),
      tier,
    }
  })

  return res.status(200).json(formatted)
}

// لوحة "Stars" العامة: أعلى 10 حسب الوقت المتراكم هذا الأسبوع (weekly_time_seconds)
// + ترتيب المستخدم الحالي (me) حتى لو مو ضمن أعلى 10، عن طريق عد
// كم لاعب عنده وقت أكبر منه.
async function handleStarsLeaderboard(req, res) {
  const { data: players, error } = await supabase
    .from('players')
    .select('telegram_id, username, photo_url, weekly_time_seconds')
    .order('weekly_time_seconds', { ascending: false })
    .limit(10)

  if (error) throw error

  const formatted = (players || []).map((player, index) => {
    const seconds = player.weekly_time_seconds || 0

    return {
      rank: index + 1,
      telegramId: String(player.telegram_id),
      name: player.username ? `@${player.username}` : `Player_${String(player.telegram_id).slice(-4)}`,
      photoUrl: player.photo_url || null,
      minutes: Math.floor(seconds / 60),
      seconds,
    }
  })

  let me = null

  const requestedTelegramId =
    req.query.telegramId
      ? String(req.query.telegramId)
      : null

  if (requestedTelegramId) {
    const inTop = formatted.find(
      (p) => p.telegramId === requestedTelegramId
    )

    if (inTop) {
      me = inTop
    } else {
      const { data: meRow, error: meError } = await supabase
        .from('players')
        .select('telegram_id, username, photo_url, weekly_time_seconds')
        .eq('telegram_id', requestedTelegramId)
        .maybeSingle()

      if (!meError && meRow) {
        const mySeconds = meRow.weekly_time_seconds || 0

        const { count: aheadCount, error: countError } = await supabase
          .from('players')
          .select('telegram_id', { count: 'exact', head: true })
          .gt('weekly_time_seconds', mySeconds)

        if (!countError) {
          me = {
            rank: (aheadCount || 0) + 1,
            telegramId: String(meRow.telegram_id),
            name: meRow.username ? `@${meRow.username}` : `Player_${String(meRow.telegram_id).slice(-4)}`,
            photoUrl: meRow.photo_url || null,
            minutes: Math.floor(mySeconds / 60),
            seconds: mySeconds,
          }
        }
      }
    }
  }

  return res.status(200).json({ list: formatted, me })
}

// لوحة "Comet Run": أعلى 10 حسب أفضل نتيجة مسجّلة (runner_best_score)
// + ترتيب اللاعب الحالي (me) بنفس أسلوب لوحة Stars بالضبط.
async function handleRunnerLeaderboard(req, res) {
  const { data: players, error } = await supabase
    .from('players')
    .select('telegram_id, username, runner_best_score')
    .gt('runner_best_score', 0)
    .order('runner_best_score', { ascending: false })
    .limit(10)

  if (error) throw error

  const formatted = (players || []).map((player, index) => ({
    rank: index + 1,
    telegramId: String(player.telegram_id),
    name: player.username ? `@${player.username}` : `Player_${String(player.telegram_id).slice(-4)}`,
    score: player.runner_best_score || 0,
  }))

  let me = null

  const requestedTelegramId =
    req.query.telegramId
      ? String(req.query.telegramId)
      : null

  if (requestedTelegramId) {
    const inTop = formatted.find(
      (p) => p.telegramId === requestedTelegramId
    )

    if (inTop) {
      me = inTop
    } else {
      const { data: meRow, error: meError } = await supabase
        .from('players')
        .select('telegram_id, username, runner_best_score')
        .eq('telegram_id', requestedTelegramId)
        .maybeSingle()

      if (!meError && meRow) {
        const myScore = meRow.runner_best_score || 0

        const { count: aheadCount, error: countError } = await supabase
          .from('players')
          .select('telegram_id', { count: 'exact', head: true })
          .gt('runner_best_score', myScore)

        if (!countError) {
          me = {
            rank: (aheadCount || 0) + 1,
            telegramId: String(meRow.telegram_id),
            name: meRow.username ? `@${meRow.username}` : `Player_${String(meRow.telegram_id).slice(-4)}`,
            score: myScore,
          }
        }
      }
    }
  }

  return res.status(200).json({ list: formatted, me })
}

// تسجيل نتيجة جديدة للعبة Comet Run: محمي بمصادقة تيليجرام (initData) - مو
// admin secret - عشان أي لاعب يقدر يرسل نتيجته هو بس، ونحدّث السجل فقط لو
// النتيجة الجديدة أعلى من رقمه القياسي المخزّن (best-of, مو تراكمي).
async function handleSubmitRunnerScore(req, res) {
  const auth = authenticateRequest(req)

  if (!auth) {
    return res.status(401).json({
      error: 'Invalid or missing Telegram authentication',
    })
  }

  const telegramId = auth.id
  const rawScore = Number(req.body && req.body.score)

  if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > MAX_RUNNER_SCORE) {
    return res.status(400).json({ error: 'Invalid score' })
  }

  const score = Math.floor(rawScore)

  const { data: playerRow, error: playerError } = await supabase
    .from('players')
    .select('runner_best_score')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  if (playerError) throw playerError

  const currentBest = playerRow?.runner_best_score || 0

  if (score <= currentBest) {
    return res.status(200).json({ success: true, bestScore: currentBest, isNewBest: false })
  }

  const { error: updateError } = await supabase
    .from('players')
    .update({
      runner_best_score: score,
      runner_best_score_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId)

  if (updateError) throw updateError

  return res.status(200).json({ success: true, bestScore: score, isNewBest: true })
}

// نسخة الأدمن: قائمة أطول (لعرضها بلوحة admin.html) - محمية بـ x-admin-secret
async function handleStarsAdminList(req, res) {
  const { data: players, error } = await supabase
    .from('players')
    .select('telegram_id, username, weekly_time_seconds')
    .order('weekly_time_seconds', { ascending: false })
    .limit(500)

  if (error) throw error

  return res.status(200).json({ success: true, players: players || [] })
}

// تصفير وقت الأسبوع لكل اللاعبين (يستدعيها الأدمن يدوياً بعد ما يوزع الجوائز)
async function handleResetWeeklyTime(req, res) {
  const { error } = await supabase
    .from('players')
    .update({
      weekly_time_seconds: 0,
      weekly_time_last_ping: new Date().toISOString(),
    })
    .gte('telegram_id', 0)

  if (error) throw error

  return res.status(200).json({ success: true })
}

// تصفير عدادات Stars القديمة فقط (للتوافق مع سجلات قاعدة البيانات)،
// بدون ما يلمس weekly_time_seconds.
async function handleResetStarsAds(req, res) {
  const { error } = await supabase
    .from('players')
    .update({
      stars_ad_batch_count: 0,
      stars_ad_intent: false,
      stars_ad_started_at: null,
      stars_ad_verified: false,
      stars_cycle_started_at: null,
      stars_cycle_duration_seconds: 0,
      stars_cycle_credited_seconds: 0,
    })
    .gte('telegram_id', 0)

  if (error) throw error

  return res.status(200).json({ success: true })
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query.type === 'stars') {
        if (req.query.admin === '1') {
          if (!isAdminRequest(req)) {
            return res.status(401).json({ error: 'Unauthorized' })
          }
          return await handleStarsAdminList(req, res)
        }

        return await handleStarsLeaderboard(req, res)
      }

      if (req.query.type === 'runner') {
        return await handleRunnerLeaderboard(req, res)
      }

      return await handleCoinLeaderboard(req, res)
    }

    if (req.method === 'POST') {
      const action = req.body && req.body.action

      // هذا الـaction محمي بمصادقة اللاعب نفسه (initData) وليس admin secret،
      // عشان أي لاعب يقدر يرسل نتيجة لعبته هو بس - يتحقق داخل الدالة نفسها.
      if (action === 'submit_runner_score') {
        return await handleSubmitRunnerScore(req, res)
      }

      if (!isAdminRequest(req)) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (action === 'reset_weekly_time') {
        return await handleResetWeeklyTime(req, res)
      }

      if (action === 'reset_stars_ads') {
        return await handleResetStarsAds(req, res)
      }

      return res.status(400).json({ error: 'Unknown action' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
