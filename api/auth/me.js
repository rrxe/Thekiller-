import crypto from 'node:crypto'
import { supabase } from '../../lib/supabase.js'
import { authenticateRequest } from '../../lib/telegram-auth.js'
import { getAppSettings } from '../../lib/settings.js'
import { logLedger } from '../../lib/ledger.js'

const ENERGY_MAX = 5
const ENERGY_REGEN_MS = 30 * 60 * 1000
const ONLINE_THRESHOLD_MINUTES = 2


const GAMES_FREE_DAILY_ATTEMPTS = 10

function isSameUtcDay(dateA, dateB) {
  return (
    dateA.getUTCFullYear() === dateB.getUTCFullYear() &&
    dateA.getUTCMonth() === dateB.getUTCMonth() &&
    dateA.getUTCDate() === dateB.getUTCDate()
  )
}

function getTodayBaghdad() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// نستخرج IP الحقيقي تبع المستخدم من هيدرز فيرسل. x-forwarded-for
// ممكن تحتوي أكثر من IP مفصولة بفاصلة (سلسلة البروكسيات) - أول وحدة
// هي عنوان المستخدم الحقيقي.
function normalizeIp(value) {
  if (!value) return null

  const ip = String(value).trim()

  if (!ip || ip.length > 120) {
    return null
  }

  if (ip.startsWith('::ffff:')) {
    return ip.slice(7)
  }

  return ip
}

function getClientIp(req) {
  const realIp =
    normalizeIp(
      req.headers['x-real-ip']
    )

  if (realIp) {
    return realIp
  }

  const forwarded =
    req.headers['x-forwarded-for']

  if (forwarded) {
    const first =
      String(forwarded)
        .split(',')[0]
        .trim()

    const normalized =
      normalizeIp(first)

    if (normalized) {
      return normalized
    }
  }

  return normalizeIp(
    req.socket?.remoteAddress
  )
}

// معرّف الجهاز يوصلنا من الواجهة عبر هيدر X-Device-Id (مولّد ومخزّن
// بـ localStorage تبع الـ WebView - يبقى ثابت حتى لو تغيرت الشبكة أو
// حساب تيليجرام على نفس الجهاز).

let warnedAboutFallbackSalt = false

function getSecuritySalt() {
  const dedicatedSalt =
    process.env.ANTI_ABUSE_SALT

  if (dedicatedSalt) {
    return dedicatedSalt
  }

  const fallbackSecret =
    process.env.BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY

  if (fallbackSecret) {
    if (!warnedAboutFallbackSalt) {
      console.warn(
        '[security] ANTI_ABUSE_SALT is not configured; using an existing server secret as a temporary fallback. Set ANTI_ABUSE_SALT in production.'
      )
      warnedAboutFallbackSalt = true
    }

    return fallbackSecret
  }

  throw new Error(
    'ANTI_ABUSE_SALT is not configured and no fallback server secret is available'
  )
}

function hashSecurityValue(value) {
  if (!value) return null

  return crypto
    .createHash('sha256')
    .update(
      `${getSecuritySalt()}::${String(value)}`,
      'utf8'
    )
    .digest('hex')
}

function getUserAgentHash(req) {
  const userAgent =
    req.headers['user-agent']

  if (!userAgent) return null

  return hashSecurityValue(
    String(userAgent)
  )
}

// بصمة هاردوير حقيقية (شاشة/معالج/تايم زون/لغة..) القادمة من هيدر
// X-Client-Signals اللي الواجهة ترسله أصلاً مع كل طلب (getClientSignals
// بملف App.tsx) بس كان بدون استخدام بالسيرفر. هذي أقوى بكثير من
// device_id لأنها مبنية على خصائص هاردوير/متصفح فعلية - تضل نفسها
// حتى لو المستخدم مسح localStorage أو فتح بوضع خفي، وهذي كانت أسهل
// طريقة يفلت فيها أي حد من فحص device_id القديم.
function getClientSignalsHash(req) {
  const raw = req.headers['x-client-signals']
  if (!raw) return null

  const trimmed = String(raw).trim()
  if (!trimmed || trimmed.length > 2000) return null

  return hashSecurityValue(trimmed)
}

// يفحص هل جهاز/بصمة معينة مستخدمة من حساب ثاني غير الحساب الحالي.
// يُستخدم وقت التسجيل (excludeTelegramId=null) ووقت كل دخول لاحق
// (excludeTelegramId=telegramId نفسه) عشان الفحص يصير مستمر مو مرة
// وحدة بس عند التسجيل.
async function findDuplicateAccount(deviceHash, fpHash, ipHash, uaHash, excludeTelegramId) {
  // فحص معرف الجهاز (device_hash) رجع تاني: لو نفس معرف الجهاز مستخدم
  // من حساب ثاني، يُعتبر تكرار حتى لو اختلفت بصمة الهاردوير (fpHash)
  // أو الـ IP.
  // 1) بصمة الجهاز (fp_hash) - أقوى إشارة، نهائية، تتفحص أول شي.
  if (fpHash) {
    let query = supabase
      .from('players')
      .select('telegram_id')
      .eq('security_fp_hash', fpHash)
      .limit(1)

    if (excludeTelegramId) {
      query = query.neq('telegram_id', excludeTelegramId)
    }

    const { data, error } = await query
    if (error) throw error
    if (data && data.length > 0) return true
  }

  // 2) معرف الجهاز (device_hash) - قوي بس أضعف من البصمة (ينمسح
  // بمسح localStorage).
  if (deviceHash) {
    let query = supabase
      .from('players')
      .select('telegram_id')
      .eq('security_device_hash', deviceHash)
      .limit(1)

    if (excludeTelegramId) {
      query = query.neq('telegram_id', excludeTelegramId)
    }

    const { data, error } = await query
    if (error) throw error
    if (data && data.length > 0) return true
  }

  if (ipHash && uaHash) {
    let query = supabase
      .from('players')
      .select('telegram_id')
      .eq('security_ip_hash', ipHash)
      .eq('security_ua_hash', uaHash)
      .limit(1)

    if (excludeTelegramId) {
      query = query.neq('telegram_id', excludeTelegramId)
    }

    const { data, error } = await query
    if (error) throw error
    if (data && data.length > 0) return true
  }

  return false
}

function appendSecurityHistory(
  history,
  value,
  limit = 20
) {
  const current =
    Array.isArray(history)
      ? history.filter(Boolean)
      : []

  if (!value) {
    return current.slice(-limit)
  }

  const next =
    current.filter(
      item => item !== value
    )

  next.push(value)

  return next.slice(-limit)
}

function getDeviceId(req) {
  const deviceId = req.headers['x-device-id']
  if (!deviceId) return null

  const trimmed = String(deviceId).trim()
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null
}


async function getWithdrawalDailyState(player) {
  const today = getTodayBaghdad()

  let withdrawalsToday = Number(
    player.withdrawals_today || 0
  )

  if (
    !Number.isFinite(withdrawalsToday) ||
    withdrawalsToday < 0
  ) {
    withdrawalsToday = 0
  }

  withdrawalsToday = Math.trunc(
    withdrawalsToday
  )

  let withdrawalCountDate =
    player.withdrawal_count_date || today

  if (
    withdrawalCountDate !== today
  ) {
    withdrawalsToday = 0
    withdrawalCountDate = today

    const { error } = await supabase
      .from('players')
      .update({
        withdrawals_today: 0,
        withdrawal_count_date: today,
      })
      .eq(
        'telegram_id',
        player.telegram_id
      )

    if (error) {
      throw error
    }
  }

  return {
    withdrawalsToday,
    withdrawalCountDate,
    withdrawalAdsRequired: 0,
  }
}

/**
 * نظام محاولات الألعاب اليومي: عدد محاولات مجانية ثابت باليوم +
 * محاولات إضافية (bonus) تُكتسب بمشاهدة إعلان، بنفس فكرة عداد
 * السحب اليومي - يرجع للصفر كل يوم بتوقيت بغداد.
 */
async function getGamesDailyState(player) {
  const today = getTodayBaghdad()

  let attemptsUsed = Number(player.game_attempts_used || 0)
  if (!Number.isFinite(attemptsUsed) || attemptsUsed < 0) {
    attemptsUsed = 0
  }
  attemptsUsed = Math.trunc(attemptsUsed)

  let bonusAttempts = 0

  let attemptsDate = player.game_attempts_date || today

  if (attemptsDate !== today) {
    attemptsUsed = 0
    bonusAttempts = 0
    attemptsDate = today

    const { error } = await supabase
      .from('players')
      .update({
        game_attempts_used: 0,
        game_bonus_attempts: 0,
        game_attempts_date: today,
      })
      .eq('telegram_id', player.telegram_id)

    if (error) {
      throw error
    }
  }

  const totalAllowed = GAMES_FREE_DAILY_ATTEMPTS
  const remaining = Math.max(0, totalAllowed - attemptsUsed)

  return {
    attemptsUsed,
    bonusAttempts,
    attemptsDate,
    freeAttempts: GAMES_FREE_DAILY_ATTEMPTS,
    remaining,
  }
}


function getMiningState(player, settings) {
  const active = player.mining_active === true

  const startedAt =
    player.mining_started_at
      ? new Date(player.mining_started_at)
      : null

  const startedAtMs =
    startedAt &&
    !Number.isNaN(startedAt.getTime())
      ? startedAt.getTime()
      : null

  const miningCycleMs =
    settings.miningCycleHours *
    60 *
    60 *
    1000

  const claimAvailableAtMs =
    startedAtMs !== null
      ? startedAtMs + miningCycleMs
      : null

  const now = Date.now()

  const claimReady =
    active &&
    claimAvailableAtMs !== null &&
    now >= claimAvailableAtMs

  return {
    active,
    reward: settings.miningRewardCoins,
    cycleHours: settings.miningCycleHours,
    startedAt:
      startedAt
        ? startedAt.toISOString()
        : null,
    claimAvailableAt:
      claimAvailableAtMs !== null
        ? new Date(
            claimAvailableAtMs
          ).toISOString()
        : null,
    claimReady,
  }
}

async function getOrCreatePlayer(auth, telegramId, req) {
  let { data: player, error } = await supabase
    .from('players')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()

  if (error && error.code !== 'PGRST116') throw error


  if (!player) {
    const signupIp =
      getClientIp(req)

    const signupDeviceId =
      getDeviceId(req)

    const signupIpHash =
      hashSecurityValue(
        signupIp
      )

    const signupDeviceHash =
      hashSecurityValue(
        signupDeviceId
      )

    const signupUaHash =
      getUserAgentHash(req)

    const signupFpHash =
      getClientSignalsHash(req)

    const newPlayerPayload = {
      telegram_id: telegramId,
      username: auth.username,
      coin: 0,
      usdt_balance: 0,
      energy: ENERGY_MAX,
      energy_updated_at: new Date().toISOString(),
      is_banned: false,
      withdrawal_ads_watched: 0,
      withdrawals_today: 0,
      withdrawal_count_date: getTodayBaghdad(),
      mining_active: false,
      mining_started_at: null,
      mining_ad_intent: null,
      mining_start_ad_verified: false,
      mining_claim_ad_verified: false,
      photo_url:
        auth.photoUrl || null,
      weekly_time_seconds: 0,
      weekly_time_last_ping:
        new Date().toISOString(),
      signup_ip:
        signupIp,

      signup_device_id:
        signupDeviceId,

      security_ip_hash:
        signupIpHash,

      security_device_hash:
        signupDeviceHash,

      security_ua_hash:
        signupUaHash,

      security_fp_hash:
        signupFpHash,

      security_last_seen_at:
        new Date().toISOString(),

      security_ip_history:
        signupIpHash
          ? [signupIpHash]
          : [],

      is_duplicate_device:
        false,
    }

    let referrerId = null

    if (
      auth.startParam &&
      auth.startParam.startsWith('ref_')
    ) {
      const candidate =
        auth.startParam.replace(
          'ref_',
          ''
        )

      if (
        candidate &&
        String(candidate) !== String(telegramId)
      ) {
        referrerId = candidate
        newPlayerPayload.referred_by =
          candidate
      }
    }

    // فحص التكرار عند التسجيل: يفحص device hash (أضعف، ينمسح
    // بمسح localStorage) + fp hash (بصمة هاردوير حقيقية، أقوى) +
    // IP+UA مع بعض (أضعف مؤشر، بس مفيد كطبقة إضافية).
    let duplicateFound = await findDuplicateAccount(
      signupDeviceHash,
      signupFpHash,
      signupIpHash,
      signupUaHash,
      null
    )

    if (duplicateFound) {
      newPlayerPayload.is_duplicate_device =
        true

      delete newPlayerPayload.referred_by

      referrerId = null
    }

    const {
      data: created,
      error: insertError,
    } = await supabase
      .from('players')
      .insert([
        newPlayerPayload,
      ])
      .select()
      .single()

    if (insertError) throw insertError

    player = created

    // لا يتم منح مكافأة الإحالة عند التسجيل.
    // تُمنح فقط بعد إكمال المُحال 5 Tasks.
  } else {
    const currentIp =
      getClientIp(req)

    const currentDeviceId =
      getDeviceId(req)

    const currentIpHash =
      hashSecurityValue(
        currentIp
      )

    const currentDeviceHash =
      hashSecurityValue(
        currentDeviceId
      )

    const currentUaHash =
      getUserAgentHash(req)

    const currentFpHash =
      getClientSignalsHash(req)

    const currentHistory =
      Array.isArray(
        player.security_ip_history
      )
        ? player.security_ip_history
        : []

    const securityUpdate = {
      security_ip_hash:
        currentIpHash ||
        player.security_ip_hash ||
        null,

      security_device_hash:
        currentDeviceHash ||
        player.security_device_hash ||
        null,

      security_ua_hash:
        currentUaHash ||
        player.security_ua_hash ||
        null,

      security_fp_hash:
        currentFpHash ||
        player.security_fp_hash ||
        null,

      security_last_seen_at:
        new Date().toISOString(),

      security_ip_history:
        appendSecurityHistory(
          currentHistory,
          currentIpHash
        ),
    }

    // إعادة تقييم "تكرار" عند كل دخول - مو بس وقت التسجيل. لو صار
    // تطابق جهاز/بصمة مع حساب ثاني بعد ما هذا الحساب صار موجود من
    // قبل (مثلاً نفس الشخص استخدم جهاز الحساب الأول بحساب جديد بعدين)،
    // نعلّم الحساب فوراً بدل ما يضل العلم "نظيف" للأبد لمجرد إنه
    // انسجل قبل الحساب الثاني.
    if (player.is_duplicate_device !== true) {
      const foundDuplicateNow = await findDuplicateAccount(
        currentDeviceHash,
        currentFpHash,
        currentIpHash,
        currentUaHash,
        telegramId
      )

      if (foundDuplicateNow) {
        securityUpdate.is_duplicate_device = true
      }
    }

    const {
      error: securityError,
    } = await supabase
      .from('players')
      .update(
        securityUpdate
      )
      .eq(
        'telegram_id',
        telegramId
      )

    if (securityError) {
      throw securityError
    }

    player.security_ip_hash =
      securityUpdate.security_ip_hash

    player.security_device_hash =
      securityUpdate.security_device_hash

    player.security_ua_hash =
      securityUpdate.security_ua_hash

    player.security_fp_hash =
      securityUpdate.security_fp_hash

    player.security_ip_history =
      securityUpdate.security_ip_history

    if (securityUpdate.is_duplicate_device === true) {
      player.is_duplicate_device = true
    }

    if (
      auth.username &&
      auth.username !== player.username
    ) {
      await supabase
        .from('players')
        .update({
          username:
            auth.username,
        })
        .eq(
          'telegram_id',
          telegramId
        )


      player.username =
        auth.username
    }
  }

  return player
}

async function processQualifiedReferral(player) {
  const settings = await getAppSettings()
  const REQUIRED_TASKS = settings.referralRequiredTasks

  if (
    !player?.referred_by ||
    player.referral_reward_claimed === true
  ) {
    return false
  }

  // حاجز أخير: لو الحساب معلّم "جهاز مكرر"، ما تنصرف له مكافأة
  // الإحالة إطلاقاً حتى لو صار عنده referred_by محفوظة من قبل.
  if (player.is_duplicate_device === true) {
    return false
  }

  const {
    data: completions,
    error: completionsError,
  } = await supabase
    .from('task_completions')
    .select('completion_count')
    .eq(
      'telegram_id',
      player.telegram_id
    )

  if (completionsError) {
    throw completionsError
  }

  const completedTasks =
    (completions || []).reduce(
      (sum, row) => {
        const count =
          Number(
            row.completion_count || 0
          )

        if (
          !Number.isFinite(count) ||
          count <= 0
        ) {
          return sum
        }

        return (
          sum +
          Math.trunc(count)
        )
      },
      0
    )

  if (
    completedTasks <
    REQUIRED_TASKS
  ) {
    return false
  }

  const {
    data: claimedRows,
    error: claimError,
  } = await supabase
    .from('players')
    .update({
      referral_reward_claimed:
        true,
    })
    .eq(
      'telegram_id',
      player.telegram_id
    )
    .eq(
      'referral_reward_claimed',
      false
    )
    .not(
      'referred_by',
      'is',
      null
    )
    .select('referred_by')
    .limit(1)

  if (claimError) {
    throw claimError
  }

  const claimed =
    Array.isArray(
      claimedRows
    )
      ? claimedRows[0]
      : null

  if (
    !claimed?.referred_by
  ) {
    return false
  }

  const {
    data: referrer,
    error: referrerError,
  } = await supabase
    .from('players')
    .select(
      'telegram_id, usdt_balance'
    )
    .eq(
      'telegram_id',
      claimed.referred_by
    )
    .single()

  if (
    referrerError ||
    !referrer
  ) {
    await supabase
      .from('players')
      .update({
        referral_reward_claimed:
          false,
      })
      .eq(
        'telegram_id',
        player.telegram_id
      )

    if (referrerError) {
      throw referrerError
    }

    return false
  }

  const newUsdtBalance =
    Number(
      (
        Number(
          referrer.usdt_balance ||
            0
        ) +
        settings.referralRewardUsdt
      ).toFixed(6)
    )

  const {
    error: rewardError,
  } = await supabase
    .from('players')
    .update({
      usdt_balance:
        newUsdtBalance,
    })
    .eq(
      'telegram_id',
      referrer.telegram_id
    )

  if (rewardError) {
    await supabase
      .from('players')
      .update({
        referral_reward_claimed:
          false,
      })
      .eq(
        'telegram_id',
        player.telegram_id
      )

    throw rewardError
  }

  await logLedger(referrer.telegram_id, 'referral', {
    usdt: Number(settings.referralRewardUsdt),
    detail: `إحالة ${player.telegram_id}`,
  })

  console.log(
    `[Referral] ${player.telegram_id} qualified with ${completedTasks} tasks`
  )

  return true
}

async function regenerateEnergy(player) {
  let energy =
    Number(
      player.energy ??
        ENERGY_MAX
    )

  if (
    !Number.isFinite(energy)
  ) {
    energy =
      ENERGY_MAX
  }

  energy = Math.max(
    0,
    Math.min(
      ENERGY_MAX,
      Math.floor(energy)
    )
  )

  let updatedAt =
    player.energy_updated_at
      ? new Date(
          player.energy_updated_at
        )
      : new Date()

  if (
    Number.isNaN(
      updatedAt.getTime()
    )
  ) {
    updatedAt =
      new Date()
  }

  const now =
    new Date()

  if (
    energy >=
    ENERGY_MAX
  ) {
    if (
      !player.energy_updated_at
    ) {

      await supabase
        .from('players')
        .update({
          energy:
            ENERGY_MAX,
          energy_updated_at:
            now.toISOString(),
        })
        .eq(
          'telegram_id',
          player.telegram_id
        )
    }

    return {
      energy:
        ENERGY_MAX,
      energyUpdatedAt:
        updatedAt.toISOString(),
    }
  }

  const elapsedMs =
    Math.max(
      0,
      now.getTime() -
        updatedAt.getTime()
    )

  const regenerated =
    Math.floor(
      elapsedMs /
        ENERGY_REGEN_MS
    )

  if (
    regenerated <= 0
  ) {
    return {
      energy,
      energyUpdatedAt:
        updatedAt.toISOString(),
    }
  }

  const newEnergy =
    Math.min(
      ENERGY_MAX,
      energy +
        regenerated
    )

  const consumedRegenTime =
    regenerated *
    ENERGY_REGEN_MS

  let newUpdatedAtMs =
    updatedAt.getTime() +
    consumedRegenTime


  if (
    newEnergy >=
    ENERGY_MAX
  ) {
    newUpdatedAtMs =
      now.getTime()
  }

  const newUpdatedAt =
    new Date(
      newUpdatedAtMs
    )

  const {
    error: updateError,
  } = await supabase
    .from('players')
    .update({
      energy:
        newEnergy,
      energy_updated_at:
        newUpdatedAt.toISOString(),
    })
    .eq(
      'telegram_id',
      player.telegram_id
    )

  if (updateError) {
    throw updateError
  }

  return {
    energy:
      newEnergy,
    energyUpdatedAt:
      newUpdatedAt.toISOString(),
  }
}

// نحدّث last_seen_at بس (لتتبع "أونلاين الآن"). احتساب وقت مسابقة
// Stars ما عاد يعتمد على فرق الوقت بين نبضتين - صار مرتبط مباشرة
// مسار التتبع القديم للوقت الأسبوعي محفوظ فقط لتوافق قاعدة البيانات.
import {
  extractChannelChatId,
  getChannelMembershipStatus,
  isConfirmedNotJoined,
} from '../../lib/telegram-membership.js'

const CHANNEL_JOIN_PENALTY_COINS = 1000

async function recheckJoinChannelTasks(telegramId) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) return { leftChannelTaskIds: [] }

  const { data: joinTasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, url')
    .eq('task_type', 'join_channel')

  if (tasksError || !joinTasks || joinTasks.length === 0) {
    return { leftChannelTaskIds: [] }
  }

  const joinTaskIds = joinTasks.map((t) => t.id)

  const { data: completions, error: completionsError } = await supabase
    .from('task_completions')
    .select('task_id, completion_count')
    .eq('telegram_id', telegramId)
    .in('task_id', joinTaskIds)
    .gt('completion_count', 0)

  if (completionsError || !completions || completions.length === 0) {
    return { leftChannelTaskIds: [] }
  }

  const taskById = {}
  for (const t of joinTasks) taskById[t.id] = t

  const leftChannelTaskIds = []

  for (const completion of completions) {
    const task = taskById[completion.task_id]
    if (!task) continue

    const channelChatId = extractChannelChatId(task.url)
    if (!channelChatId) continue

    const membership = await getChannelMembershipStatus(
      botToken,
      channelChatId,
      telegramId
    )

    if (!membership.ok) continue
    if (!isConfirmedNotJoined(membership.status)) continue

    leftChannelTaskIds.push(task.id)
  }

  if (leftChannelTaskIds.length === 0) {
    return { leftChannelTaskIds: [] }
  }

  const totalPenalty =
    CHANNEL_JOIN_PENALTY_COINS * leftChannelTaskIds.length

  const { data: freshPlayer } = await supabase
    .from('players')
    .select('coin')
    .eq('telegram_id', telegramId)
    .single()

  const currentCoins = Number(freshPlayer?.coin || 0)
  const newCoins = Math.max(0, currentCoins - totalPenalty)

  await supabase
    .from('players')
    .update({ coin: newCoins })
    .eq('telegram_id', telegramId)

  await supabase
    .from('task_completions')
    .update({ completion_count: 0, opened_at: null })
    .eq('telegram_id', telegramId)
    .in('task_id', leftChannelTaskIds)

  return { leftChannelTaskIds, newCoins }
}

// عدادات دورة Stars القديمة محفوظة فقط لتوافق قاعدة البيانات القديمة.
const STARS_AD_MINUTES_PER_AD = 5
const STARS_AD_SECONDS_PER_AD = STARS_AD_MINUTES_PER_AD * 60
const STARS_MAX_ADS_PER_RUN = 24

async function applyStarsCycleCredit(player, telegramId) {
  const cycleStartedAt =
    player.stars_cycle_started_at
      ? new Date(player.stars_cycle_started_at)
      : null

  if (!cycleStartedAt || Number.isNaN(cycleStartedAt.getTime())) {
    return
  }

  // مدة الدورة الحالية محفوظة في قاعدة البيانات لأغراض التوافق مع السجلات القديمة.
  const cycleDurationMs =
    Math.max(0, Number(player.stars_cycle_duration_seconds) || 0) * 1000

  if (cycleDurationMs <= 0) {
    return
  }

  const elapsedMs = Date.now() - cycleStartedAt.getTime()

  const cappedElapsedSeconds = Math.min(
    Math.floor(Math.max(0, elapsedMs) / 1000),
    cycleDurationMs / 1000
  )
const alreadyCredited = player.stars_cycle_credited_seconds || 0
  const delta = cappedElapsedSeconds - alreadyCredited
  const cycleFinished = elapsedMs >= cycleDurationMs

  if (delta <= 0 && !cycleFinished) {
    return
  }

  const updates = {
    weekly_time_seconds:
      (player.weekly_time_seconds || 0) + Math.max(0, delta),
    stars_cycle_credited_seconds: cappedElapsedSeconds,
  }

  if (cycleFinished) {
    updates.stars_cycle_started_at = null
    updates.stars_cycle_duration_seconds = 0
    updates.stars_ad_batch_count = 0
    updates.stars_cycle_credited_seconds = 0
  }

  const { data: updatedRow, error } = await supabase
    .from('players')
    .update(updates)
    .eq('telegram_id', telegramId)
    .select(
      'weekly_time_seconds, stars_cycle_started_at, stars_cycle_duration_seconds, stars_ad_batch_count, stars_cycle_credited_seconds'
    )
    .single()

  if (error) {
    console.error('applyStarsCycleCredit failed:', error)
    return
  }

  if (updatedRow) {
    player.weekly_time_seconds = updatedRow.weekly_time_seconds
    player.stars_cycle_started_at = updatedRow.stars_cycle_started_at
    player.stars_cycle_duration_seconds = updatedRow.stars_cycle_duration_seconds
    player.stars_ad_batch_count = updatedRow.stars_ad_batch_count
    player.stars_cycle_credited_seconds = updatedRow.stars_cycle_credited_seconds
  }
}

async function touchLastSeen(
  player,
  auth
) {
  try {
    const now = new Date()

    const updatePayload = {
      last_seen_at: now.toISOString(),
      weekly_time_last_ping: now.toISOString(),
    }

    if (auth?.photoUrl) {
      updatePayload.photo_url = auth.photoUrl
    }

    await supabase
      .from('players')
      .update(updatePayload)
      .eq(
        'telegram_id',
        player.telegram_id
      )
  } catch (err) {
    console.error(
      'touchLastSeen error:',
      err
    )
  }
}


async function getMandatorySubscriptionStatus(
  telegramId
) {
  const {
    data: channels,
    error,
  } = await supabase
    .from('mandatory_channels')
    .select(
      'id, title, channel_url, chat_id'
    )
    .eq(
      'is_active',
      true
    )
    .order(
      'sort_order',
      {
        ascending: true,
      }
    )
    .order(
      'created_at',
      {
        ascending: true,
      }
    )

  if (error) {
    throw error
  }

  if (
    !channels ||
    channels.length === 0
  ) {
    return {
      required: false,
      verified: true,
      channels: [],
      missing: [],
    }
  }

  const botToken =
    process.env.BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) {
    throw new Error(
      'BOT_TOKEN is not configured'
    )
  }

  const results = []
  const missing = []

  for (
    const channel
    of channels
  ) {
    let joined = false

    try {
      const controller =
        new AbortController()

      const timeoutId =
        setTimeout(
          () =>
            controller.abort(),
          5000
        )

      try {
        const response =
          await fetch(
            `https://api.telegram.org/bot${botToken}/getChatMember`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                chat_id:
                  channel.chat_id,

                user_id:
                  Number(
                    telegramId
                  ),
              }),

              signal:
                controller.signal,
            }
          )

        const data =
          await response
            .json()
            .catch(
              () => ({})
            )

        if (
          data?.ok &&
          data?.result
        ) {
          const status =
            String(
              data.result.status ||
                ''
            )

          joined =
            status === 'member' ||
            status === 'administrator' ||
            status === 'creator' ||
            (
              status === 'restricted' &&
              data.result.is_member === true
            )
        }
      } finally {
        clearTimeout(
          timeoutId
        )
      }
    } catch (err) {
      console.error(
        `[MandatorySubscription] Failed checking ${channel.chat_id}:`,
        err
      )

      /*
       * A failed membership check is treated
       * as not verified rather than allowing access.
       */
      joined = false
    }

    const item = {
      id:
        String(channel.id),

      title:
        channel.title,

      url:
        channel.channel_url,

      joined,
    }

    results.push(item)

    if (!joined) {
      missing.push(item)
    }
  }

  return {
    required: true,

    verified:
      missing.length === 0,

    channels:
      results,

    missing:
      missing,
  }
}


export default async function handler(
  req,
  res
) {
  if (
    req.method !== 'GET' &&
    req.method !== 'POST'
  ) {
    return res.status(405).json({
      error: 'Method not allowed',
    })
  }

  // ==========================================
  // 1. نظام المشرف
  // ==========================================
  const adminSecret =
    req.headers[
      'x-admin-secret'
    ]

  if (
    adminSecret &&
    process.env.ADMIN_SECRET &&
    adminSecret ===
      process.env.ADMIN_SECRET
  ) {
    if (
      req.method === 'GET' &&
      req.query.admin ===
        'users'
    ) {
      const PAGE_SIZE = 1000
      let data = []
      let from = 0

      while (true) {
        const {
          data: pageData,
          error,
        } = await supabase
          .from('players')
          .select(
            'telegram_id, username, coin, is_banned, is_duplicate_device, weekly_time_seconds, photo_url'
          )
          .order(
            'coin',
            {
              ascending: false,
            }
          )
          .range(from, from + PAGE_SIZE - 1)

        if (error) {
          return res.status(500).json({
            error:
              error.message,
          })
        }

        if (!pageData || pageData.length === 0) break

        data = data.concat(pageData)

        if (pageData.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      // نحسب عدد الإحالات لكل لاعب: كم شخص دخل عن طريق رابطه
      // (referralsTotal) وكم منهم أكمل الشرط واستحق المكافأة فعلاً
      // (referralsQualified). استعلام واحد فقط لكل اللاعبين المُحالين
      // بدل ما نسوي استعلام منفصل لكل لاعب بالقائمة (تجنّب N+1).
      const referralTotals = {}
      const referralQualified = {}

      const {
        data: referredRows,
        error: referredError,
      } = await supabase
        .from('players')
        .select('referred_by, referral_reward_claimed')
        .not('referred_by', 'is', null)

      if (!referredError && referredRows) {
        for (const row of referredRows) {
          const key = String(row.referred_by)
          referralTotals[key] = (referralTotals[key] || 0) + 1
          if (row.referral_reward_claimed === true) {
            referralQualified[key] = (referralQualified[key] || 0) + 1
          }
        }
      }

      const usersWithReferrals = (data || []).map((user) => {
        const key = String(user.telegram_id)
        return {
          ...user,
          referralsTotal: referralTotals[key] || 0,
          referralsQualified: referralQualified[key] || 0,
        }
      })

      return res.status(200).json({
        success: true,
        users:
          usersWithReferrals,
      })
    }

    if (
      req.method === 'GET' &&
      req.query.admin === 'user_detail'
    ) {
      const rawQuery = String(req.query.q || req.query.telegram_id || '').trim()

      if (!rawQuery) {
        return res.status(400).json({
          success: false,
          error: 'أرسل telegram_id أو username بباراميتر q',
        })
      }

      const isNumericId = /^\d+$/.test(rawQuery)

      let playerQuery = supabase.from('players').select('*')
      playerQuery = isNumericId
        ? playerQuery.eq('telegram_id', rawQuery)
        : playerQuery.ilike('username', rawQuery.replace(/^@/, ''))

      const { data: players, error: playerError } = await playerQuery.limit(1)

      if (playerError) {
        return res.status(500).json({ success: false, error: playerError.message })
      }

      const player = Array.isArray(players) ? players[0] : null

      if (!player) {
        return res.status(404).json({ success: false, error: 'ما لقيت لاعب بهذا الاسم/الـ ID' })
      }

      const telegramId = player.telegram_id

      // إحصاء الإحالات: كم شخص دخل برابطه (Total) وكم منهم أكمل الشرط
      // واستحق المكافأة فعلاً (Qualified) - هذا اللي المفروض usdt_balance
      // مبني عليه بالكامل (USDT ما ينكسب بأي طريقة ثانية بالتطبيق).
      const { data: referredRows, error: referredError } = await supabase
        .from('players')
        .select('*')
        .eq('referred_by', telegramId)

      if (referredError) {
        return res.status(500).json({ success: false, error: referredError.message })
      }

      const referralsTotal = (referredRows || []).length
      const referralsQualified = (referredRows || []).filter(
        (r) => r.referral_reward_claimed === true
      ).length

      const settings = await getAppSettings()
      const rewardPerReferral = Number(settings.referralRewardUsdt || 0.01)
      const expectedUsdtFromReferrals = Number(
        (referralsQualified * rewardPerReferral).toFixed(6)
      )

      // كل سحوبات اليوزر (مو بس المعلّقة زي شاشة "طلبات السحب") -
      // عشان نعرف كم فعلياً طلع من رصيده USDT بره التطبيق.
      const { data: withdrawals, error: withdrawalsError } = await supabase
        .from('withdrawal_history')
        .select('id, amount, method, target, bnb_amount, status, created_at')
        .eq('telegram_id', telegramId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (withdrawalsError) {
        return res.status(500).json({ success: false, error: withdrawalsError.message })
      }

      // من وين إجت العملات (coin): كل مهمة أكملها وكم مرة، مربوطة بمكافأة
      // كل مهمة عشان نعرف مجموع العملات من كل مصدر.
      const { data: completions, error: completionsError } = await supabase
        .from('task_completions')
        .select('task_id, completion_count')
        .eq('telegram_id', telegramId)
        .gt('completion_count', 0)

      if (completionsError) {
        return res.status(500).json({ success: false, error: completionsError.message })
      }

      const taskIds = (completions || []).map((c) => c.task_id)

      let tasksById = {}
      if (taskIds.length > 0) {
        const { data: taskRows, error: taskRowsError } = await supabase
          .from('tasks')
          .select('id, title, task_type, reward')
          .in('id', taskIds)

        if (taskRowsError) {
          return res.status(500).json({ success: false, error: taskRowsError.message })
        }

        tasksById = Object.fromEntries((taskRows || []).map((t) => [t.id, t]))
      }

      const taskBreakdown = (completions || []).map((c) => {
        const task = tasksById[c.task_id] || {}
        return {
          taskId: c.task_id,
          title: task.title || '(مهمة محذوفة)',
          taskType: task.task_type || null,
          rewardPerCompletion: Number(task.reward || 0),
          completionCount: c.completion_count,
          totalCoins: Number(task.reward || 0) * c.completion_count,
        }
      })

      // أكواد الهدايا اللي استخدمها (مصدر عملات موثّق)
      let giftCoins = 0
      let giftCount = 0
      try {
        const { data: redemptions } = await supabase
          .from('gift_code_redemptions')
          .select('code_id')
          .eq('telegram_id', telegramId)

        const codeIds = (redemptions || []).map((r) => r.code_id)
        if (codeIds.length > 0) {
          const { data: codes } = await supabase
            .from('gift_codes')
            .select('id, reward_coins')
            .in('id', codeIds)
          const rewardById = Object.fromEntries(
            (codes || []).map((c) => [c.id, Number(c.reward_coins || 0)])
          )
          for (const r of redemptions) giftCoins += rewardById[r.code_id] || 0
          giftCount = codeIds.length
        }
      } catch (giftErr) {
        console.error('user_detail gift codes failed:', giftErr)
      }

      // مصدر USDT: من الإحالات أو من تحويل العملات (api/exchange.js)
      const EXCHANGE_RATE_USDT_PER_COIN = 0.0000025
      const sumWithdrawals = (status) =>
        (withdrawals || [])
          .filter((w) => w.status === status)
          .reduce((sum, w) => sum + Number(w.amount || 0), 0)

      const usdtBalanceNow = Number(player.usdt_balance || 0)
      const withdrawnCompleted = Number(sumWithdrawals('completed').toFixed(4))
      const withdrawnPending = Number(sumWithdrawals('pending').toFixed(4))
      // المرفوض ينرجع للرصيد تلقائياً، فما ننحسب.
      const usdtEverEarned = Number(
        (usdtBalanceNow + withdrawnCompleted + withdrawnPending).toFixed(4)
      )
      const usdtFromExchange = Number(
        Math.max(0, usdtEverEarned - expectedUsdtFromReferrals).toFixed(4)
      )

      // [ledger-v3] backend
      const referralList = (referredRows || [])
        .map((r) => ({
          telegram_id: r.telegram_id,
          username: r.username || null,
          coin: Number(r.coin || 0),
          usdt_balance: Number(r.usdt_balance || 0),
          is_banned: r.is_banned === true,
          is_duplicate_device: r.is_duplicate_device === true,
          qualified: r.referral_reward_claimed === true,
        }))
        .sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.coin - a.coin)
        .slice(0, 100)

      let referredBy = null
      if (player.referred_by) {
        try {
          const { data: refPlayer } = await supabase
            .from('players')
            .select('telegram_id, username')
            .eq('telegram_id', player.referred_by)
            .maybeSingle()
          referredBy = refPlayer || { telegram_id: player.referred_by, username: null }
        } catch (e) {
          referredBy = { telegram_id: player.referred_by, username: null }
        }
      }

      // [linked-v5] backend: الحسابات المرتبطة بنفس الشخص/الجهاز
      const LINK_COLS = 'telegram_id, username, coin, usdt_balance, is_banned, is_duplicate_device'
      const linkedMap = new Map()
      const addLinked = (rows, reason) => {
        for (const row of rows || []) {
          if (String(row.telegram_id) === String(telegramId)) continue
          const key = String(row.telegram_id)
          if (!linkedMap.has(key)) {
            linkedMap.set(key, {
              telegram_id: row.telegram_id,
              username: row.username || null,
              coin: Number(row.coin || 0),
              usdt_balance: Number(row.usdt_balance || 0),
              is_banned: row.is_banned === true,
              is_duplicate_device: row.is_duplicate_device === true,
              reasons: [],
            })
          }
          const item = linkedMap.get(key)
          if (!item.reasons.includes(reason)) item.reasons.push(reason)
        }
      }
      const findLinked = async (reason, build) => {
        try {
          const { data, error } = await build(
            supabase
              .from('players')
              .select(LINK_COLS)
              .neq('telegram_id', telegramId)
              .limit(30)
          )
          if (error) throw error
          addLinked(data, reason)
        } catch (linkErr) {
          console.error(`user_detail linked (${reason}) failed:`, linkErr.message || linkErr)
        }
      }

      const linkJobs = []
      if (player.security_fp_hash) {
        linkJobs.push(findLinked('fp', (q) => q.eq('security_fp_hash', player.security_fp_hash)))
      }
      if (player.signup_device_id) {
        linkJobs.push(findLinked('device', (q) => q.eq('signup_device_id', player.signup_device_id)))
      }
      if (player.security_device_hash) {
        linkJobs.push(findLinked('device', (q) => q.eq('security_device_hash', player.security_device_hash)))
      }
      await Promise.all(linkJobs)

      // [linked-v6] الربط بالبصمة و/أو معرّف الجهاز فقط (الـ IP لحاله ما يكفي)
      const LINK_SCORE = { fp: 100, device: 60 }
      const linkedAccounts = Array.from(linkedMap.values())
        .map((x) => ({
          ...x,
          score: x.reasons.reduce((s, r) => s + (LINK_SCORE[r] || 0), 0),
        }))
        .sort((a, b) => b.score - a.score || b.coin - a.coin)
        .slice(0, 40)

      const linkedInfo = {
        total: linkedAccounts.length,
        both: linkedAccounts.filter(
          (x) => x.reasons.includes('fp') && x.reasons.includes('device')
        ).length,
        coins: linkedAccounts.reduce((s, x) => s + x.coin, 0),
        usdt: Number(linkedAccounts.reduce((s, x) => s + x.usdt_balance, 0).toFixed(4)),
      }

      let ledger = []
      let ledgerSince = null
      let ledgerReady = true
      try {
        const { data: ledgerRows, error: ledgerError } = await supabase
          .from('coin_ledger')
          .select('*')
          .eq('telegram_id', String(telegramId))
          .order('id', { ascending: false })
          .limit(300)
        if (ledgerError) throw ledgerError
        ledger = ledgerRows || []

        const { data: firstRow } = await supabase
          .from('coin_ledger')
          .select('created_at')
          .order('id', { ascending: true })
          .limit(1)
        ledgerSince = firstRow && firstRow[0] ? firstRow[0].created_at : null
      } catch (ledgerErr) {
        ledgerReady = false
        console.error('user_detail ledger failed:', ledgerErr)
      }

      const usdtFlow = {
        balance: usdtBalanceNow,
        withdrawnCompleted,
        withdrawnPending,
        totalEarned: usdtEverEarned,
        fromReferrals: expectedUsdtFromReferrals,
        fromExchange: usdtFromExchange,
        coinsExchanged: Math.round(usdtFromExchange / EXCHANGE_RATE_USDT_PER_COIN),
        withdrawalsTruncated: (withdrawals || []).length >= 50,
      }

      // مصدر العملات: اللي انحفظ بجداول + الباقي "بدون مصدر موثّق"
      const coinsNow = Number(player.coin || 0)
      const coinsEverEarned = coinsNow + usdtFlow.coinsExchanged
      const tasksCoins = taskBreakdown.reduce((s, t) => s + t.totalCoins, 0)
      const coinFlow = {
        current: coinsNow,
        exchanged: usdtFlow.coinsExchanged,
        earnedTotal: coinsEverEarned,
        tasks: tasksCoins,
        tasksCount: taskBreakdown.length,
        gifts: giftCoins,
        giftsCount: giftCount,
        other: Math.max(0, coinsEverEarned - tasksCoins - giftCoins),
        streak: player.streak || 0,
        lastCheckin: player.last_checkin || null,
      }

      return res.status(200).json({
        success: true,
        player: {
          telegram_id: player.telegram_id,
          username: player.username,
          coin: player.coin,
          usdt_balance: player.usdt_balance,
          is_banned: player.is_banned,
          is_duplicate_device: player.is_duplicate_device,
          referred_by: player.referred_by,
          referral_reward_claimed: player.referral_reward_claimed,
          weekly_time_seconds: player.weekly_time_seconds,
          photo_url: player.photo_url,
          streak: player.streak || 0,
          last_checkin: player.last_checkin || null,
        },
        referrals: {
          total: referralsTotal,
          qualified: referralsQualified,
          rewardPerReferral,
          expectedUsdtFromReferrals,
        },
        usdtFlow,
        coinFlow,
        ledger,
        ledgerSince,
        ledgerReady,
        referralList,
        referredBy,
        linkedAccounts,
        linkedInfo,
        withdrawals: withdrawals || [],
        taskBreakdown,
      })
    }

    if (
      req.method === 'GET' &&
      req.query.admin ===
        'stats'
    ) {
      const {
        count:
          totalPlayers,
        error:
          totalError,
      } = await supabase
        .from('players')
        .select(
          'telegram_id',
          {
            count: 'exact',
            head: true,
          }
        )

      if (totalError) {
        return res.status(500).json({
          success: false,
          error:
            totalError.message,
        })
      }

      const onlineSince =
        new Date(
          Date.now() -
            ONLINE_THRESHOLD_MINUTES *
              60 *
              1000
        ).toISOString()

      const {
        count: onlineNow,
        error: onlineError,
      } = await supabase
        .from('players')
        .select(
          'telegram_id',
          {
            count: 'exact',
            head: true,
          }
        )
        .gte(
          'last_seen_at',
          onlineSince
        )

      if (onlineError) {
        return res.status(500).json({
          success: false,
          error:
            onlineError.message,
        })
      }

      return res.status(200).json({
        success: true,
        totalPlayers:
          totalPlayers || 0,
        onlineNow:
          onlineNow || 0,
      })
    }

    if (
      req.method === 'POST'
    ) {
      const {
        action,
        targetTelegramId,
      } = req.body || {}

      if (
        action ===
          'admin_ban' ||
        action ===
          'admin_unban'
      ) {
        if (!targetTelegramId) {
          return res.status(400).json({
            error:
              'Missing targetTelegramId',
          })
        }

        const isBanned =
          action ===
          'admin_ban'

        const updateData = {
          is_banned:
            isBanned,
        }

        if (isBanned) {
          updateData.coin = 0
        }

        const {
          error,
        } = await supabase
          .from('players')
          .update(
            updateData
          )
          .eq(
            'telegram_id',
            targetTelegramId
          )

        if (error) {
          return res.status(500).json({
            error:
              error.message,
          })
        }

        return res.status(200).json({
          success: true,
          isBanned,
        })
      }
    }
  }

  // ==========================================
  // 2. نظام اللاعبين العادي
  // ==========================================
  const auth =
    authenticateRequest(
      req
    )

  if (!auth) {
    return res.status(401).json({
      error:
        'Invalid or missing Telegram authentication',
    })
  }

  const telegramId =
    auth.id

  try {
    const player =
      await getOrCreatePlayer(
        auth,
        telegramId,
        req
      )

    const settings =
      await getAppSettings()

    let mandatorySubscription = {
      required: false,
      verified: true,
      channels: [],
      missing: [],
    }
    try {
      mandatorySubscription =
        await getMandatorySubscriptionStatus(
          telegramId
        )
    } catch (e) {
      console.error(
        '[MandatorySub] Fallback:',
        e
      )
    }

    await processQualifiedReferral(
      player
    )

    if (player.is_banned) {
      return res.status(403).json({
        error:
          'ACCOUNT_BANNED',
        message:
          'تم حظر حسابك بسبب استخدام سكربتات أو طرق غير مشروعة.',
      })
    }

    // ملاحظة: is_duplicate_device ما عاد يوقف الحساب بالكامل.
    // منع الإحالة صاير أصلاً وقت التسجيل (referred_by ما ينحفظ
    // للحساب المكرر)، فهذا الحقل هنا يبقى فقط للتوثيق/الإدارة
    // بدون ما يقفل التطبيق بوجه المستخدم.

    let channelRecheck = { leftChannelTaskIds: [] }

    if (req.method === 'GET') {
      channelRecheck = await recheckJoinChannelTasks(telegramId)

      if (typeof channelRecheck.newCoins === 'number') {
        player.coin = channelRecheck.newCoins
      }
    }

    await applyStarsCycleCredit(player, telegramId)

    touchLastSeen(
      player,
      auth
    )

    /*
     * MINING
     */

    if (req.method === 'POST') {
      const {
        action,
      } = req.body || {}

      if (
        action === 'mining_start'
      ) {
        const {
          data: startedRows,
          error: startError,
        } = await supabase
          .from('players')
          .update({
            mining_active:
              true,
            mining_started_at:
              new Date().toISOString(),
            mining_ad_intent:
              null,
            mining_start_ad_verified:
              false,
            mining_claim_ad_verified:
              false,
          })
          .eq(
            'telegram_id',
            telegramId
          )
          .eq(
            'mining_active',
            false
          )
          .select(
            'mining_active, mining_started_at'
          )

        if (startError) {
          throw startError
        }

        if (
          !startedRows ||
          startedRows.length === 0
        ) {
          return res.status(400).json({
            error:
              'Mining could not be started',
          })
        }


        const mining =
          getMiningState(
            {
              ...player,
              mining_active:
                true,
              mining_started_at:
                startedRows[0].mining_started_at,
            },
            settings
          )

        return res.status(200).json({
          success: true,
          mining,
        })
      }

      if (
        action === 'mining_claim'
      ) {
        const { error: legacyClaimUnlockError } = await supabase
          .from('players')
          .update({
            mining_claim_ad_verified: true,
            mining_ad_intent: null,
          })
          .eq('telegram_id', telegramId)
          .eq('mining_active', true)

        if (legacyClaimUnlockError) {
          throw legacyClaimUnlockError
        }

        const {
          data: result,
          error: claimError,
        } = await supabase.rpc(
          'claim_mining_reward',
          {
            p_telegram_id:
              telegramId,
            p_now:
              new Date().toISOString(),
          }
        )

        if (claimError) {
          throw claimError
        }

        const row =
          Array.isArray(result)
            ? result[0]
            : result

        if (
          !row?.success
        ) {
          return res.status(400).json({
            error:
              'Mining is not ready to be claimed',
          })
        }

        await logLedger(telegramId, 'mining_claim', {
          coins: Number(settings.miningRewardCoins),
          detail: 'مكافأة التعدين',
          balanceAfter: Number(row.new_coins),
        })

        return res.status(200).json({
          success: true,
          reward:
            settings.miningRewardCoins,
          coins:
            Number(
              row.new_coins
            ),
          mining: {
            active: false,
            reward:
              settings.miningRewardCoins,
            cycleHours:
              settings.miningCycleHours,
            startedAt: null,
            claimAvailableAt:
              null,
            claimReady:
              false,
          },
        })
      }
    }

    /*
     * CONSUME ENERGY
     */
    if (
      req.method === 'POST'
    ) {
      const {
        action,
      } = req.body || {}

      if (
        action === 'stars_ad_prepare'
      ) {
        const cycleStartedAt =
          player.stars_cycle_started_at
            ? new Date(player.stars_cycle_started_at)
            : null

        const cycleDurationMs =
          Math.max(0, Number(player.stars_cycle_duration_seconds) || 0) * 1000

        const isLocked =
          cycleStartedAt &&
          !Number.isNaN(cycleStartedAt.getTime()) &&
          cycleDurationMs > 0 &&
          Date.now() - cycleStartedAt.getTime() < cycleDurationMs

        if (isLocked) {
          return res.status(200).json({
            success: true,
            locked: true,
            batchCount: player.stars_ad_batch_count || 0,
            adsRequired: STARS_MAX_ADS_PER_RUN,
            cycleUnlocksAt: new Date(
              cycleStartedAt.getTime() + cycleDurationMs
            ).toISOString(),
          })
        }

        const currentBatch = player.stars_ad_batch_count || 0

        if (currentBatch >= STARS_MAX_ADS_PER_RUN) {
          return res.status(400).json({
            error: 'Ad limit reached — use your balance to start a run',
          })
        }

        const { error: prepareError } = await supabase
          .from('players')
          .update({
            stars_ad_intent: true,
            stars_ad_started_at: new Date().toISOString(),
            stars_ad_verified: false,
          })
          .eq('telegram_id', telegramId)

        if (prepareError) {
          throw prepareError
        }

        return res.status(200).json({
          success: true,
          locked: false,
          batchCount: currentBatch,
          adsRequired: STARS_MAX_ADS_PER_RUN,
        })
      }

      if (
        action === 'stars_ad_cancel'
      ) {
        await supabase
          .from('players')
          .update({
            stars_ad_intent: false,
            stars_ad_started_at: null,
            stars_ad_verified: false,
          })
          .eq('telegram_id', telegramId)

        return res.status(200).json({
          success: true,
        })
      }

      if (
        action === 'stars_ad_use_balance'
      ) {
        // مسار التوافق القديم للـStars؛ الواجهة الحالية لا تستدعيه.
        const cycleStartedAt =
          player.stars_cycle_started_at
            ? new Date(player.stars_cycle_started_at)
            : null

        const existingDurationMs =
          Math.max(0, Number(player.stars_cycle_duration_seconds) || 0) * 1000

        const alreadyRunning =
          cycleStartedAt &&
          !Number.isNaN(cycleStartedAt.getTime()) &&
          existingDurationMs > 0 &&
          Date.now() - cycleStartedAt.getTime() < existingDurationMs

        if (alreadyRunning) {
          return res.status(400).json({
            error: 'A run is already in progress',
            cycleUnlocksAt: new Date(
              cycleStartedAt.getTime() + existingDurationMs
            ).toISOString(),
          })
        }

        const currentBatch = Number(player.stars_ad_batch_count || 0)

        if (currentBatch <= 0) {
          return res.status(400).json({ error: 'No balance to use' })
        }

        const durationSeconds = currentBatch * STARS_AD_SECONDS_PER_AD
        const startedAtIso = new Date().toISOString()

        const { error: useError } = await supabase
          .from('players')
          .update({
            stars_cycle_started_at: startedAtIso,
            stars_cycle_duration_seconds: durationSeconds,
            stars_cycle_credited_seconds: 0,
            stars_ad_batch_count: 0,
          })
          .eq('telegram_id', telegramId)

        if (useError) {
          throw useError
        }

        return res.status(200).json({
          success: true,
          starsAdBatchCount: 0,
          starsCycleUnlocksAt: new Date(
            Date.now() + durationSeconds * 1000
          ).toISOString(),
        })
      }

      /*
       * GAMES: محاولات يومية محدودة متاحة مباشرة.
       */


      if (
        action === 'games_start_attempt'
      ) {
        const gamesState = await getGamesDailyState(player)

        if (gamesState.remaining <= 0) {
          return res.status(400).json({
            error: 'No attempts left',
            gamesAttemptsRemaining: 0,
          })
        }

        const nextUsed = gamesState.attemptsUsed + 1

        const { error: useError } = await supabase
          .from('players')
          .update({
            game_attempts_used: nextUsed,
            game_attempts_date: gamesState.attemptsDate,
            // [game-guard] نفتح جولة: مكافأة اللعبة ما تنقبل إلا لجولة مفتوحة
            game_run_open: true,
            game_run_started_at: new Date().toISOString(),
          })
          .eq('telegram_id', telegramId)

        if (useError) {
          throw useError
        }

        return res.status(200).json({
          success: true,
          gamesAttemptsRemaining: Math.max(
            0,
            GAMES_FREE_DAILY_ATTEMPTS - nextUsed
          ),
        })
      }

      if (
        action ===
        'consume_energy'
      ) {
        const regenerated =
          await regenerateEnergy(
            player
          )

        const currentEnergy =
          regenerated.energy

        if (
          currentEnergy <=
          0
        ) {
          return res.status(400).json({
            error:
              'Not enough energy',
            energy: 0,
            energyMax:
              ENERGY_MAX,
            energyRegenMinutes:
              30,
          })
        }

        const newEnergy =
          currentEnergy - 1

        const now =
          new Date()

        const {
          data: updated,
          error: updateError,
        } =
          await supabase
            .from('players')
            .update({
              energy:
                newEnergy,
              energy_updated_at:
                now.toISOString(),
            })
            .eq(
              'telegram_id',
              telegramId
            )
            .select(
              'energy, energy_updated_at'
            )
            .single()

        if (updateError) {
          throw updateError
        }

        return res.status(200).json({
          success: true,
          energy:
            updated.energy ??
            newEnergy,
          energyMax:
            ENERGY_MAX,
          energyRegenMinutes:
            30,
          energyUpdatedAt:
            updated.energy_updated_at,
        })
      }

      return res.status(400).json({
        error:
          'Unknown action',
      })
    }

    /*
     * GET PLAYER DATA
     */
    const energyState =
      await regenerateEnergy(
        player
      )

    let claimedToday =
      false

    if (
      player.last_checkin
    ) {
      claimedToday =
        isSameUtcDay(
          new Date(
            player.last_checkin
          ),
          new Date()
        )
    }

    const {
      count:
        referralsCount,
    } = await supabase
      .from('players')
      .select(
        'telegram_id',
        {
          count: 'exact',
          head: true,
        }
      )
      .eq(
        'referred_by',
        telegramId
      )
      .eq(
        'referral_reward_claimed',
        true
      )

    const withdrawalDailyState =
      await getWithdrawalDailyState(
        player
      )

    const gamesDailyState =
      await getGamesDailyState(
        player
      )

    const {
      data:
        withdrawalHistoryRows,
    } = await supabase
      .from('withdrawal_history')
      .select(
        'id, amount, method, target, bnb_amount, status, created_at'
      )
      .eq(
        'telegram_id',
        telegramId
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )
      .limit(20)

    const withdrawalHistory = (
      withdrawalHistoryRows ||
      []
    ).map((row) => ({
      id: row.id,
      amount: row.amount,
      method: row.method,
      target: row.target,
      bnbAmount:
        row.bnb_amount,
      status: row.status,
      createdAt:
        row.created_at,
    }))

    const mining =
      getMiningState(
        player,
        settings
      )

    // نطلع إشعار "تكرار" للمستخدم مرة وحدة بس بعمر الحساب كله - مو
    // كل ما يفتح التطبيق. نسجّل إنه انشاف بقاعدة البيانات (مو
    // localStorage قابل للمسح ولا React state يرجع يصفّر بكل reload)
    // عشان مرة وحدة فعلية حتى لو بدّل جهاز أو مسح الكاش.
    let showDuplicateNotice = false

    if (
      player.is_duplicate_device === true &&
      player.duplicate_notice_seen !== true
    ) {
      showDuplicateNotice = true

      const { error: noticeError } = await supabase
        .from('players')
        .update({ duplicate_notice_seen: true })
        .eq('telegram_id', player.telegram_id)

      if (!noticeError) {
        player.duplicate_notice_seen = true
      }
    }

    return res.status(200).json({
      membershipRequired:
        mandatorySubscription.required,

      membershipVerified:
        mandatorySubscription.verified,

      requiredChannels:
        mandatorySubscription.channels,

      missingChannels:
        mandatorySubscription.missing,

      telegramId:
        String(
          player.telegram_id
        ),

      username:
        player.username,

      isDuplicateDevice:
        showDuplicateNotice,

      coins:
        player.coin || 0,

      usdtBalance:
        player.usdt_balance ||
        0,

      walletAddress:
        player.wallet_address ||
        null,

      streak:
        player.streak || 0,

      claimedToday,

      referralsCount:
        referralsCount || 0,

      referralRewardUsdt:
        settings.referralRewardUsdt,

      referralRequiredTasks:
        settings.referralRequiredTasks,

      withdrawalHistory,

      energy:
        energyState.energy,

      energyMax:
        ENERGY_MAX,

      energyUpdatedAt:
        energyState.energyUpdatedAt,

      energyRegenMinutes:
        30,

      withdrawalAdsWatched:
        player.withdrawal_ads_watched ||
        0,

      weeklyTimeSeconds:
        player.weekly_time_seconds ||
        0,

      starsAdVerified:
        player.stars_ad_verified === true,

      starsAdBatchCount:
        player.stars_ad_batch_count || 0,

      starsAdsRequired: STARS_MAX_ADS_PER_RUN,

      starsAdCreditMinutes:
        (player.stars_ad_batch_count || 0) * STARS_AD_MINUTES_PER_AD,

      starsCycleUnlocksAt:
        player.stars_cycle_started_at &&
        Number(player.stars_cycle_duration_seconds) > 0
          ? new Date(
              new Date(player.stars_cycle_started_at).getTime() +
                Number(player.stars_cycle_duration_seconds) * 1000
            ).toISOString()
          : null,

      withdrawalAdsRequired:
        withdrawalDailyState.withdrawalAdsRequired,

      withdrawalsToday:
        withdrawalDailyState.withdrawalsToday,

      nextWithdrawalAvailableAt:
        null,

      gamesAttemptsRemaining:
        gamesDailyState.remaining,

      gamesFreeAttempts:
        gamesDailyState.freeAttempts,

      gamesBonusAttempts:
        gamesDailyState.bonusAttempts,

      gamesAdIntent:
        player.game_ad_intent === true,

      runnerBestScore:
        player.runner_best_score || 0,

      mining,

      channelTasksReset:
        channelRecheck.leftChannelTaskIds,
    })
  } catch (err) {
    console.error(
      'auth/me error:',
      err
    )

    return res.status(500).json({
      error:
        err.message,
    })
  }
}
