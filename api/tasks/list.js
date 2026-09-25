import { supabase } from '../../lib/supabase.js'
import { authenticateRequest } from '../../lib/telegram-auth.js'

// هذا الـ endpoint يرجع المهام المفعلة للتطبيق، مع تقدّم اللاعب
// الحقيقي المسجل بجدول task_completions - مو من localStorage
// بالجهاز. قبل هذا التعديل، الـ endpoint كان عام بلا مصادقة ويرجع
// بس بيانات المهام نفسها (بدون completed)، فالواجهة كانت مجبورة
// تعتمد بالكامل على كاش محلي ممكن يفقد المزامنة مع الحقيقة بالسيرفر.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = authenticateRequest(req)

  if (!auth) {
    return res.status(401).json({
      error: 'Invalid or missing Telegram authentication',
    })
  }

  const telegramId = auth.id

  try {
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, reward, url, is_active, task_type, max_completions')
      .eq('is_active', true)
      .order('sort_order', {
        ascending: true,
        nullsFirst: false,
      })
      .order('created_at', { ascending: false })

    if (tasksError) throw tasksError

    const supportedTaskTypes = new Set([
      'normal',
      'join_channel',
      'custom',
      'join_bot',
    ])

    const visibleTasks = (tasks || []).filter(
      (task) => supportedTaskTypes.has(String(task.task_type || '').toLowerCase())
    )

    const { data: completions, error: completionsError } = await supabase
      .from('task_completions')
      .select('task_id, completion_count')
      .eq('telegram_id', telegramId)

    if (completionsError) throw completionsError

    const completedById = new Map()
    for (const row of completions || []) {
      completedById.set(String(row.task_id), Number(row.completion_count || 0))
    }

    const tasksWithProgress = visibleTasks.map((task) => ({
      ...task,
      completed: completedById.get(String(task.id)) || 0,
    }))

    return res.status(200).json({
      success: true,
      tasks: tasksWithProgress,
    })
  } catch (err) {
    console.error('tasks/list error:', err)
    return res.status(500).json({
      success: false,
      error: err.message,
    })
  }
}
