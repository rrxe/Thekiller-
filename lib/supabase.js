import { createClient } from '@supabase/supabase-js'

// نفس الرابط والمفتاح تستخدمهم كل ملفات المشروع من هسه فصاعداً
// تأكد إنك ضايف بمتغيرات البيئة (Vercel -> Settings -> Environment Variables):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (المفتاح السري "service_role" مو الـ anon key)
// لأجل التوافق مع الاسم القديم SUPABASE_SECRET_KEY تركنا fallback إله بالأسفل
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[supabase] متغيرات البيئة ناقصة: تأكد من ضبط SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Vercel'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})
