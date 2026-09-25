import { supabase } from '../../lib/supabase.js'
import { authenticateRequest } from '../../lib/telegram-auth.js'
import { getAppSettings } from '../../lib/settings.js'
import { logLedger } from '../../lib/ledger.js'
import {
  extractChannelChatId,
  getChannelMembershipStatus,
  isConfirmedNotJoined,
} from '../../lib/telegram-membership.js'

const CHANNEL_JOIN_PENALTY_COINS = 1000

// [game-guard] أعلى مكافأة حقيقية لجولة: Runner=450، Laser Escape=500
const GAME_RUN_MAX_REWARD = 500
// أقل وقت مقبول بين بدء الجولة واستلام مكافأتها
const GAME_RUN_MIN_MS = 8000

const BUILTIN_TASKS = {
  join_channel: 500,
  game_run: null,
}

const NORMAL_TASK_WAIT_MS = 5000


function toPositiveInt(value) {
  const raw = Array.isArray(value) ? value[0] : value
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.trunc(num)
}

function nowIso() {
  return new Date().toISOString()
}



async function getTask(taskId) {
  return supabase
    .from('tasks')
    .select('id, reward, is_active, max_completions, task_type, url')
    .eq('id', taskId)
    .single()
}

async function enforceChannelJoinVerification(task, telegramId) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) return { allowed: true }

  const channelChatId = extractChannelChatId(task.url)

  if (!channelChatId) return { allowed: true }

  const membership = await getChannelMembershipStatus(
    botToken,
    channelChatId,
    telegramId
  )

  if (!membership.ok) {
    console.error(
      `[join_channel] تعذر التحقق من عضوية ${telegramId} بـ ${channelChatId}: ` +
      `${membership.description}`
    )
    return { allowed: true }
  }

  if (!isConfirmedNotJoined(membership.status)) {
    return { allowed: true }
  }

  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('coin')
    .eq('telegram_id', telegramId)
    .single()

  if (fetchError || !player) {
    return { allowed: false, penalized: 0 }
  }

  const currentCoins = Number(player.coin || 0)
  const newCoins = Math.max(0, currentCoins - CHANNEL_JOIN_PENALTY_COINS)
  const penalized = currentCoins - newCoins

  await supabase
    .from('players')
    .update({ coin: newCoins })
    .eq('telegram_id', telegramId)

  return { allowed: false, penalized, newCoins }
}

async function getCompletionRow(taskId, telegramId) {
  return supabase
    .from('task_completions')
    .select('completion_count, opened_at')
    .eq('task_id', taskId)
    .eq('telegram_id', telegramId)
    .maybeSingle()
}

async function saveCompletionRow({
  taskId,
  telegramId,
  completionCount,
  openedAt,
}) {
  return supabase
    .from('task_completions')
    .upsert(
      {
        task_id: taskId,
        telegram_id: telegramId,
        completion_count: completionCount,
        opened_at: openedAt ?? null,
      },
      {
        onConflict: 'task_id,telegram_id',
      }
    )
}

async function addCoinsToPlayer(telegramId, reward) {
  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('coin')
    .eq('telegram_id', telegramId)
    .single()

  if (fetchError || !player) {
    return {
      error: 'Player not found',
    }
  }

  const currentCoins = Number(player.coin || 0)
  const newCoins = currentCoins + reward

  const { error: updateError } = await supabase
    .from('players')
    .update({
      coin: newCoins,
    })
    .eq('telegram_id', telegramId)

  if (updateError) {
    return {
      error: updateError.message || 'Failed to update coins',
    }
  }

  return {
    newCoins,
  }
}

/**
 * يحسب إجمالي كل الـTasks التي أنجزها المستخدم.
 *
 * مثال:
 * Task عادي = 1
 * Task عادي ثاني = 1
 * المهام المدعومة تُحتسب كل مرة حسب الحد المسموح بها.
 *
 * المجموع = 10
 *
 * لذلك لا نهتم بنوع المهمة عند حساب الإحالة.
 * المهم هو مجموع completion_count لكل المهام.
 */
async function getReferralTaskCount(telegramId) {
  const { data: completions, error } = await supabase
    .from('task_completions')
    .select('completion_count')
    .eq('telegram_id', telegramId)

  if (error) {
    throw error
  }

  return (completions || []).reduce((sum, row) => {
    const count = Number(row.completion_count || 0)

    if (!Number.isFinite(count) || count <= 0) {
      return sum
    }

    return sum + Math.trunc(count)
  }, 0)
}

/**
 * تعتمد الإحالة مرة واحدة فقط بعد وصول المستخدم المحال
 * إلى 10 إنجازات Tasks.
 */
async function processReferralAfterTask(telegramId) {
  const appSettings = await getAppSettings()
  const REQUIRED_TASKS = appSettings.referralRequiredTasks
  const REFERRAL_REWARD_USDT = appSettings.referralRewardUsdt

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('telegram_id, referred_by, referral_reward_claimed')
    .eq('telegram_id', telegramId)
    .single()

  if (playerError || !player) return false

  if (
    !player.referred_by ||
    player.referral_reward_claimed === true
  ) {
    return false
  }

  const { data: completions, error: completionsError } = await supabase
    .from('task_completions')
    .select('task_id, completion_count')
    .eq('telegram_id', telegramId)

  if (completionsError) {
    throw completionsError
  }

  const completedTasks = (completions || []).reduce(
    (sum, row) => {
      const count = Number(row.completion_count || 0)

      if (!Number.isFinite(count) || count <= 0) {
        return sum
      }

      return sum + Math.trunc(count)
    },
    0
  )

  if (completedTasks < REQUIRED_TASKS) {
    return false
  }

  const { data: claimedRows, error: claimError } = await supabase
    .from('players')
    .update({
      referral_reward_claimed: true,
    })
    .eq('telegram_id', telegramId)
    .eq('referral_reward_claimed', false)
    .not('referred_by', 'is', null)
    .select('referred_by')
    .limit(1)

  if (claimError) {
    throw claimError
  }

  const claimed = Array.isArray(claimedRows)
    ? claimedRows[0]
    : null

  if (!claimed?.referred_by) {
    return false
  }

  const { data: referrer, error: referrerError } = await supabase
    .from('players')
    .select('telegram_id, usdt_balance')
    .eq('telegram_id', claimed.referred_by)
    .single()

  if (referrerError || !referrer) {
    await supabase
      .from('players')
      .update({
        referral_reward_claimed: false,
      })
      .eq('telegram_id', telegramId)

    if (referrerError) {
      throw referrerError
    }

    return false
  }

  const newUsdtBalance = Number(
    (
      Number(referrer.usdt_balance || 0) +
      REFERRAL_REWARD_USDT
    ).toFixed(6)
  )

  const { error: rewardError } = await supabase
    .from('players')
    .update({
      usdt_balance: newUsdtBalance,
    })
    .eq('telegram_id', referrer.telegram_id)

  if (rewardError) {
    await supabase
      .from('players')
      .update({
        referral_reward_claimed: false,
      })
      .eq('telegram_id', telegramId)

    throw rewardError
  }

  await logLedger(referrer.telegram_id, 'referral', {
    usdt: REFERRAL_REWARD_USDT,
    detail: `إحالة ${telegramId}`,
  })

  console.log(
    `[Referral] ${telegramId} qualified with ${completedTasks} tasks. ` +
    `Referrer ${referrer.telegram_id} received ${REFERRAL_REWARD_USDT} USDT.`
  )

  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    })
  }

  const auth = authenticateRequest(req)

  if (!auth) {
    return res.status(401).json({
      error: 'Invalid or missing Telegram authentication',
    })
  }

  const telegramId = auth.id

  try {
    const {
      taskId,
      taskType,
      reward: clientReward,
      action,
    } = req.body || {}

    /**
     * تسجيل فتح المهمة.
     */
    if (action === 'open') {
      const normalizedTaskId = toPositiveInt(taskId)

      if (!normalizedTaskId) {
        return res.status(400).json({
          error: 'Task ID is required',
        })
      }

      const {
        data: task,
        error: taskError,
      } = await getTask(normalizedTaskId)

      if (taskError || !task || !task.is_active) {
        return res.status(400).json({
          error: 'Task not found or inactive',
        })
      }


      const {
        data: completionRow,
        error: completionError,
      } = await getCompletionRow(
        normalizedTaskId,
        telegramId
      )

      if (completionError) {
        throw completionError
      }

      const currentCount = Number(
        completionRow?.completion_count || 0
      )

      const maxCompletions = Math.max(
        1,
        Number(task.max_completions || 1)
      )

      if (currentCount >= maxCompletions) {
        return res.status(400).json({
          error: 'Task completion limit reached for this player',
        })
      }

      const {
        error: saveError,
      } = await saveCompletionRow({
        taskId: normalizedTaskId,
        telegramId,
        completionCount: currentCount,
        openedAt: nowIso(),
      })

      if (saveError) {
        throw saveError
      }

      return res.status(200).json({
        success: true,
        message: 'Task open recorded',
      })
    }

    let taskReward = 0
    let progress = null
    let ledgerDetail = null

    /**
     * Task موجود في قاعدة البيانات.
     */
    if (
      taskId !== undefined &&
      taskId !== null &&
      String(taskId).trim() !== ''
    ) {
      const normalizedTaskId = toPositiveInt(taskId)

      if (!normalizedTaskId) {
        return res.status(400).json({
          error: 'Invalid Task ID',
        })
      }

      const {
        data: task,
        error: taskError,
      } = await getTask(normalizedTaskId)

      if (taskError || !task || !task.is_active) {
        return res.status(400).json({
          error: 'Task not found or inactive',
        })
      }

      const supportedTaskTypes = new Set([
        'normal',
        'join_channel',
        'custom',
        'join_bot',
      ])
      if (!supportedTaskTypes.has(String(task.task_type || '').toLowerCase())) {
        return res.status(400).json({
          error: 'Unsupported task type',
        })
      }

      const maxCompletions = Math.max(
        1,
        Number(task.max_completions || 1)
      )

      const {
        data: completionRow,
        error: completionError,
      } = await getCompletionRow(
        normalizedTaskId,
        telegramId
      )

      if (completionError) {
        throw completionError
      }

      const currentCount = Number(
        completionRow?.completion_count || 0
      )

      if (currentCount >= maxCompletions) {
        return res.status(400).json({
          error: 'Task completion limit reached for this player',
        })
      }

      if (!completionRow?.opened_at) {
        return res.status(400).json({
          error: 'Open the task link first',
        })
      }

      const openedTimestamp = Date.parse(
        completionRow.opened_at
      )

      const requiredWaitMs = NORMAL_TASK_WAIT_MS

      if (
        !Number.isFinite(openedTimestamp) ||
        Date.now() - openedTimestamp < requiredWaitMs
      ) {
        return res.status(400).json({
          error:
            `Wait ${requiredWaitMs / 1000} seconds ` +
            `after opening the task`,
        })
      }

      if (task.task_type === 'join_channel') {
        const verification = await enforceChannelJoinVerification(
          task,
          telegramId
        )

        if (!verification.allowed) {
          return res.status(400).json({
            error: 'Join the channel first, then come back to claim.',
          })
        }
      }

      const nextCount = currentCount + 1

      taskReward = Number(task.reward || 0)
      ledgerDetail = String(task.title || task.task_type || task.id || '')

      const {
        error: saveError,
      } = await saveCompletionRow({
        taskId: normalizedTaskId,
        telegramId,
        completionCount: nextCount,
        openedAt: null,
      })

      if (saveError) {
        throw saveError
      }

      progress = {
        completed: nextCount,
        max_completions: maxCompletions,
      }
    }

    // [game-guard] مكافأة اللعبة: لازم جولة مفتوحة فعلاً، وتنقفل بعملية وحدة.
    // (join_channel المدمج انشال: كان يعطي 500 بدون أي تحقق. المهام
    // الحقيقية من قاعدة البيانات تمر من الفرع اللي فوق بدون تغيير.)
    else if (taskType === 'game_run') {
      const val = Math.floor(Number(clientReward))

      if (
        !Number.isFinite(val) ||
        val <= 0 ||
        val > GAME_RUN_MAX_REWARD
      ) {
        return res.status(400).json({
          error: 'Invalid reward amount',
        })
      }

      const startedBefore = new Date(
        Date.now() - GAME_RUN_MIN_MS
      ).toISOString()

      const { data: claimedRun, error: claimRunError } = await supabase
        .from('players')
        .update({ game_run_open: false })
        .eq('telegram_id', telegramId)
        .eq('game_run_open', true)
        .lte('game_run_started_at', startedBefore)
        .select('telegram_id')

      if (claimRunError) {
        throw claimRunError
      }

      if (!claimedRun || claimedRun.length === 0) {
        return res.status(400).json({
          error: 'No active game run to claim',
        })
      }

      taskReward = val
    }

    else {
      return res.status(400).json({
        error: 'Invalid task',
      })
    }

    /**
     * إضافة المكافأة.
     */
    const coinResult = await addCoinsToPlayer(
      telegramId,
      taskReward
    )

    if (coinResult.error) {
      throw new Error(coinResult.error)
    }

    await logLedger(
      telegramId,
      taskType === 'game_run' ? 'game_run' : 'task',
      {
        coins: taskReward,
        detail: ledgerDetail || (taskType === 'game_run' ? 'جولة لعب' : String(taskType || '')),
        balanceAfter: coinResult.newCoins,
      }
    )

    /**
     * الإحالة تُفحص بعد كل Task ناجح.
     *
     * هذا يعني:
     * - Task عادي = 1
     * - كل مهمة ناجحة = تقدم واحد
     * - المجموع 10 = إحالة مقبولة.
     */
    let referralQualified = false

    if (
      taskId !== undefined &&
      taskId !== null &&
      String(taskId).trim() !== ''
    ) {
      referralQualified =
        await processReferralAfterTask(
          telegramId
        )
    }

    return res.status(200).json({
      success: true,
      coins: coinResult.newCoins,
      reward: taskReward,
      referralQualified,
      ...(progress ? { progress } : {}),
    })
  } catch (err) {
    console.error(
      'tasks/complete error:',
      err
    )

    return res.status(500).json({
      error:
        err.message ||
        'Failed to complete task',
    })
  }
}
