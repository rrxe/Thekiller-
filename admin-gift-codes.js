import { supabase } from '../../lib/supabase.js'

function isAuthorized(req) {
  const provided = req.headers['x-admin-secret']
  const expected = process.env.ADMIN_SECRET
  return Boolean(expected) && provided === expected
}

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase()
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  // =========================
  // GET — جلب كل أكواد الهدايا
  // =========================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('gift_codes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      return res.status(200).json({ success: true, giftCodes: data || [] })
    } catch (err) {
      console.error('GET /api/admin/gift-codes failed:', err)
      return res.status(500).json({ success: false, error: 'Failed to load gift codes' })
    }
  }

  // =========================
  // POST — إنشاء / تفعيل / تعطيل / حذف
  // =========================
  if (req.method === 'POST') {
    try {
      const body = req.body || {}
      const { action, id } = body

      if (action === 'toggle') {
        if (!id) {
          return res.status(400).json({ success: false, error: 'Gift code ID is required' })
        }

        const { data: giftCode, error: fetchError } = await supabase
          .from('gift_codes')
          .select('is_active')
          .eq('id', id)
          .single()

        if (fetchError || !giftCode) {
          return res.status(404).json({ success: false, error: 'Gift code not found' })
        }

        const { data: updated, error: updateError } = await supabase
          .from('gift_codes')
          .update({ is_active: !giftCode.is_active })
          .eq('id', id)
          .select()
          .single()

        if (updateError) throw updateError

        return res.status(200).json({ success: true, giftCode: updated })
      }

      if (action === 'delete') {
        if (!id) {
          return res.status(400).json({ success: false, error: 'Gift code ID is required' })
        }

        const { error: deleteError } = await supabase
          .from('gift_codes')
          .delete()
          .eq('id', id)

        if (deleteError) throw deleteError

        return res.status(200).json({ success: true })
      }

      // =========================
      // CREATE — إنشاء كود جديد
      // =========================
      const normalizedCode = normalizeCode(body.code)
      const maxUses = Math.trunc(Number(body.maxUses))
      const rewardCoins = Math.trunc(Number(body.rewardCoins))

      if (!normalizedCode) {
        return res.status(400).json({ success: false, error: 'Code is required' })
      }

      if (!Number.isFinite(maxUses) || maxUses < 1) {
        return res.status(400).json({ success: false, error: 'Max uses must be at least 1' })
      }

      if (!Number.isFinite(rewardCoins) || rewardCoins < 0) {
        return res.status(400).json({ success: false, error: 'Reward coins must be 0 or more' })
      }

      const { data: created, error: insertError } = await supabase
        .from('gift_codes')
        .insert({
          code: normalizedCode,
          reward_coins: rewardCoins,
          max_uses: maxUses,
          is_active: true,
        })
        .select()
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          return res.status(400).json({ success: false, error: 'This code already exists' })
        }
        throw insertError
      }

      return res.status(200).json({ success: true, giftCode: created })
    } catch (err) {
      console.error('POST /api/admin/gift-codes failed:', err)
      return res.status(500).json({ success: false, error: err.message || 'Failed to save gift code' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])

  return res.status(405).json({
    success: false,
    error: `Method ${req.method} Not Allowed`,
  })
}
