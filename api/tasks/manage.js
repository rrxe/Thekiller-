import { extractChannelChatId } from '../../lib/telegram-membership.js'
import { supabase } from '../../lib/supabase.js'

function isAuthorized(req) {
  const provided = req.headers['x-admin-secret']
  const expected = process.env.ADMIN_SECRET
  return Boolean(expected) && provided === expected
}

function normalizeTaskType(value) {
  const type = String(value || 'normal').trim()

  // كل أنواع المهام المدعومة
  const allowed = [
    'normal',
    'join_channel',
    'custom',
    'join_bot',
  ]

  return allowed.includes(type) ? type : 'normal'
}


async function getAppSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')

  if (error) throw error

  const settings = {}

  for (const row of data || []) {
    settings[row.key] = row.value
  }

  return settings
}

async function saveAppSetting(key, value) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key,
        value: String(value),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'key',
      }
    )

  if (error) throw error
}


async function getMandatoryChannels() {
  const { data, error } = await supabase
    .from('mandatory_channels')
    .select('*')
    .order('sort_order', {
      ascending: true,
    })
    .order('created_at', {
      ascending: true,
    })

  if (error) throw error

  return data || []
}

async function addMandatoryChannel(
  title,
  channelUrl
) {
  const cleanTitle =
    String(title || '').trim()

  const cleanUrl =
    String(channelUrl || '').trim()

  if (!cleanTitle) {
    throw new Error(
      'Channel title is required'
    )
  }

  if (!cleanUrl) {
    throw new Error(
      'Channel URL is required'
    )
  }

  const chatId =
    extractChannelChatId(
      cleanUrl
    )

  if (!chatId) {
    throw new Error(
      'Invalid Telegram channel URL or username'
    )
  }

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from('mandatory_channels')
    .select('id')
    .eq(
      'chat_id',
      chatId
    )
    .limit(1)

  if (existingError) {
    throw existingError
  }

  if (
    existing &&
    existing.length > 0
  ) {
    throw new Error(
      'This channel is already added'
    )
  }

  const {
    data,
    error,
  } = await supabase
    .from('mandatory_channels')
    .insert({
      title: cleanTitle,
      channel_url: cleanUrl,
      chat_id: chatId,
      is_active: true,
    })
    .select()
    .single()

  if (error) throw error

  return data
}

async function deleteMandatoryChannel(id) {
  const normalizedId =
    String(id || '').trim()

  if (!normalizedId) {
    throw new Error(
      'Channel ID is required'
    )
  }

  const {
    error,
  } = await supabase
    .from('mandatory_channels')
    .delete()
    .eq(
      'id',
      normalizedId
    )

  if (error) throw error

  return true
}

function normalizeMaxCompletions(value) {
  const num = Number(value)

  if (!Number.isFinite(num) || num < 1) {
    return 1
  }

  return Math.floor(num)
}


export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    })
  }

  // =========================
  // GET — جلب جميع المهام
  // =========================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('sort_order', {
          ascending: true,
          nullsFirst: false,
        })
        .order('created_at', { ascending: false })

      if (error) throw error

      return res.status(200).json({
        success: true,
        tasks: data || [],
      })
    } catch (err) {
      console.error('GET /api/tasks/manage failed:', err)

      return res.status(500).json({
        success: false,
        error: 'Failed to load tasks',
      })
    }
  }

  // =========================
  // POST — إضافة / تعديل /
  // تفعيل / تعطيل / حذف
  // =========================
  if (req.method === 'POST') {
    try {
      const body = req.body || {}

      const {
        id,
        title,
        reward,
        url,
        is_active,
        action,
        task_type,
        max_completions,
      } = body

      // =========================
      // SETTINGS
      // =========================

      if (action === 'get_settings') {
        const settings = await getAppSettings()

        return res.status(200).json({
          success: true,
          settings,
        })
      }

      if (action === 'update_settings') {
        const updates = body.settings || {}

        const allowedKeys = [
          'mining_reward_coins',
          'mining_cycle_hours',
          'referral_reward_usdt',
          'referral_required_tasks',
        ]

        for (const key of allowedKeys) {
          if (updates[key] === undefined) {
            continue
          }

          await saveAppSetting(
            key,
            updates[key]
          )
        }

        const settings =
          await getAppSettings()

        return res.status(200).json({
          success: true,
          settings,
        })
      }



      // =========================
      // MANDATORY CHANNELS
      // =========================

      if (
        action ===
        'get_mandatory_channels'
      ) {
        const channels =
          await getMandatoryChannels()

        return res.status(200).json({
          success: true,
          channels,
        })
      }

      if (
        action ===
        'add_mandatory_channel'
      ) {
        const channel =
          await addMandatoryChannel(
            body.title,
            body.channelUrl
          )

        return res.status(200).json({
          success: true,
          channel,
        })
      }

      if (
        action ===
        'delete_mandatory_channel'
      ) {
        await deleteMandatoryChannel(
          body.id
        )

        return res.status(200).json({
          success: true,
        })
      }

      const normalizedType =
        normalizeTaskType(task_type)

      // =========================
      // TOGGLE TASK
      // =========================
      if (action === 'toggle') {
        if (!id) {
          return res.status(400).json({
            success: false,
            error: 'Task ID is required',
          })
        }

        const normalizedId =
          String(id).trim()

        const {
          data: task,
          error: fetchError,
        } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', normalizedId)
          .single()

        if (fetchError || !task) {
          return res.status(404).json({
            success: false,
            error: 'Task not found',
          })
        }

        const newStatus =
          !Boolean(task.is_active)

        const {
          data: updated,
          error: updateError,
        } = await supabase
          .from('tasks')
          .update({
            is_active: newStatus,
          })
          .eq('id', normalizedId)
          .select()
          .single()

        if (updateError) {
          throw updateError
        }

        return res.status(200).json({
          success: true,
          task: updated,
          is_active: newStatus,
        })
      }

      // =========================
      // REORDER — تحريك مهمة لفوق/تحت
      // =========================
      if (action === 'move') {
        const { direction } = body

        if (!id) {
          return res.status(400).json({
            success: false,
            error: 'Task ID is required',
          })
        }

        if (
          direction !== 'up' &&
          direction !== 'down'
        ) {
          return res.status(400).json({
            success: false,
            error: 'direction must be "up" or "down"',
          })
        }

        const normalizedId =
          String(id).trim()

        // نجيب كل المهام بنفس الترتيب المعروض بالأدمن حتى
        // نعرف مين "الجار" اللي نبدل معاه الترتيب.
        const {
          data: allTasks,
          error: listError,
        } = await supabase
          .from('tasks')
          .select('id, sort_order, created_at')
          .order('sort_order', {
            ascending: true,
            nullsFirst: false,
          })
          .order('created_at', {
            ascending: false,
          })

        if (listError) throw listError

        const list = allTasks || []

        // إذا فيه مهام بدون sort_order (مهام قديمة)، نرقمها
        // أول مرة حسب ترتيبها الحالي حتى نقدر نبدل بينها بأمان.
        const needsBackfill = list.some(
          (t) => t.sort_order === null || t.sort_order === undefined
        )

        let workingList = list

        if (needsBackfill) {
          const backfillUpdates = list.map(
            (t, index) => ({
              id: t.id,
              sort_order: index,
            })
          )

          for (const u of backfillUpdates) {
            const { error: bfError } =
              await supabase
                .from('tasks')
                .update({
                  sort_order: u.sort_order,
                })
                .eq('id', u.id)

            if (bfError) throw bfError
          }

          workingList = list.map((t, index) => ({
            ...t,
            sort_order: index,
          }))
        }

        const currentIndex =
          workingList.findIndex(
            (t) => String(t.id) === normalizedId
          )

        if (currentIndex === -1) {
          return res.status(404).json({
            success: false,
            error: 'Task not found',
          })
        }

        const swapIndex =
          direction === 'up'
            ? currentIndex - 1
            : currentIndex + 1

        if (
          swapIndex < 0 ||
          swapIndex >= workingList.length
        ) {
          // أصلاً بأول أو آخر القائمة، ما فيه شي نسويه.
          return res.status(200).json({
            success: true,
            moved: false,
          })
        }

        const current = workingList[currentIndex]
        const neighbor = workingList[swapIndex]

        const { error: updateError1 } =
          await supabase
            .from('tasks')
            .update({
              sort_order: neighbor.sort_order,
            })
            .eq('id', current.id)

        if (updateError1) throw updateError1

        const { error: updateError2 } =
          await supabase
            .from('tasks')
            .update({
              sort_order: current.sort_order,
            })
            .eq('id', neighbor.id)

        if (updateError2) throw updateError2

        return res.status(200).json({
          success: true,
          moved: true,
        })
      }

      // =========================
      // DELETE — حذف مهمة
      // =========================
      if (action === 'delete') {
        if (!id) {
          return res.status(400).json({
            success: false,
            error: 'Task ID is required',
          })
        }

        const normalizedId =
          String(id).trim()

        const {
          error: deleteError,
        } = await supabase
          .from('tasks')
          .delete()
          .eq('id', normalizedId)

        if (deleteError) {
          throw deleteError
        }

        return res.status(200).json({
          success: true,
          message: 'Task deleted successfully',
        })
      }

      // =========================
      // CREATE / UPDATE
      // =========================

      if (
        typeof title !== 'string' ||
        !title.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: 'Title is required',
        })
      }

      if (
        typeof url !== 'string' ||
        !url.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: 'URL is required for tasks',
        })
      }

      const rewardNum =
        Number(reward)

      if (
        !Number.isFinite(rewardNum) ||
        rewardNum <= 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Reward must be a positive number',
        })
      }

      const MAX_REWARD = 100000

      if (
        rewardNum > MAX_REWARD
      ) {
        return res.status(400).json({
          success: false,
          error:
            `Reward exceeds max allowed (${MAX_REWARD})`,
        })
      }

      const payload = {
        title: title.trim(),

        reward: rewardNum,

        url: url.trim(),

        is_active:
          typeof is_active === 'boolean'
            ? is_active
            : true,

        task_type:
          normalizedType,

        max_completions:
          normalizeMaxCompletions(
            max_completions
          ),
      }

      let result

      // =========================
      // UPDATE
      // =========================
      if (
        id !== undefined &&
        id !== null &&
        String(id).trim() !== ''
      ) {
        const normalizedId =
          String(id).trim()

        result = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', normalizedId)
          .select()
      }

      // =========================
      // CREATE
      // =========================
      else {
        result = await supabase
          .from('tasks')
          .insert([payload])
          .select()
      }

      if (result.error) {
        throw result.error
      }

      if (
        !result.data ||
        result.data.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
        })
      }

      return res.status(200).json({
        success: true,
        task: result.data[0],
      })
    } catch (err) {
      console.error(
        'POST /api/tasks/manage failed:',
        err
      )

      return res.status(500).json({
        success: false,
        error:
          err.message ||
          'Failed to save task',
      })
    }
  }

  res.setHeader(
    'Allow',
    ['GET', 'POST']
  )

  return res.status(405).json({
    success: false,
    error:
      `Method ${req.method} Not Allowed`,
  })
}
