// Sends queued private notifications (referral joined / referral completed) to players.
import { rpc } from './supabase.js'
import { sendUserNotice, escapeHtml, buildMiniAppLink } from './telegram.js'

const L = (lang) => (['ar', 'ru', 'hi'].includes(String(lang || '').slice(0, 2)) ? String(lang).slice(0, 2) : 'en')
const pts = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

const TEXT = {
  referral_new: {
    ar: (p) => `👥 <b>إحالة جديدة!</b>\nانضم <b>${p.name}</b> عبر رابطك.\n⏳ الإحالة <b>غير مكتملة</b> بعد، تكتمل لما يشاهد ${p.ads_required} إعلان${p.tasks_required > 0 ? ` ويكمل ${p.tasks_required} مهمة` : ''}، وبعدها تحصل على <b>${pts(p.reward_pts)}</b> نقطة.`,
    en: (p) => `👥 <b>New referral!</b>\n<b>${p.name}</b> joined with your link.\n⏳ The referral is <b>not complete</b> yet. It completes after they watch ${p.ads_required} ads${p.tasks_required > 0 ? ` and finish ${p.tasks_required} tasks` : ''}, then you get <b>${pts(p.reward_pts)}</b> pts.`,
    ru: (p) => `👥 <b>Новый реферал!</b>\n<b>${p.name}</b> присоединился по вашей ссылке.\n⏳ Реферал <b>ещё не завершён</b>: нужно посмотреть ${p.ads_required} реклам${p.tasks_required > 0 ? ` и выполнить ${p.tasks_required} заданий` : ''}, затем вы получите <b>${pts(p.reward_pts)}</b> очков.`,
    hi: (p) => `👥 <b>नया रेफरल!</b>\n<b>${p.name}</b> आपके लिंक से जुड़ा।\n⏳ रेफरल अभी <b>पूरा नहीं</b> हुआ। ${p.ads_required} विज्ञापन${p.tasks_required > 0 ? ` और ${p.tasks_required} टास्क` : ''} पूरे होने पर आपको <b>${pts(p.reward_pts)}</b> पॉइंट्स मिलेंगे।`,
  },
  referral_done: {
    ar: (p) => `✅ <b>اكتملت الإحالة!</b>\nأنهى <b>${p.name}</b> الشروط، وتمت إضافة <b>${pts(p.reward_pts)}</b> نقطة لرصيدك 🎁`,
    en: (p) => `✅ <b>Referral completed!</b>\n<b>${p.name}</b> met the requirements and <b>${pts(p.reward_pts)}</b> pts were added to your balance 🎁`,
    ru: (p) => `✅ <b>Реферал завершён!</b>\n<b>${p.name}</b> выполнил условия, на ваш баланс зачислено <b>${pts(p.reward_pts)}</b> очков 🎁`,
    hi: (p) => `✅ <b>रेफरल पूरा हुआ!</b>\n<b>${p.name}</b> ने शर्तें पूरी कीं और आपके बैलेंस में <b>${pts(p.reward_pts)}</b> पॉइंट्स जुड़ गए 🎁`,
  },
}
const OPEN = { ar: 'افتح ODDXS 🎰', en: 'Open ODDXS 🎰', ru: 'Открыть ODDXS 🎰', hi: 'ODDXS खोलें 🎰' }

let busy = false
async function tick() {
  if (busy) return
  busy = true
  try {
    const rows = await rpc('oddxs_notify_claim', { p_limit: 25 })
    for (const r of rows || []) {
      const lang = L(r.lang)
      const make = TEXT[r.kind]?.[lang]
      if (!make) continue
      const p = { ...r.payload, name: escapeHtml(r.payload?.name || (lang === 'ar' ? 'لاعب' : 'A player')) }
      const url = await buildMiniAppLink('referrals')
      await sendUserNotice(r.telegram_id, make(p), { reply_markup: { inline_keyboard: [[{ text: OPEN[lang], url }]] } })
      await new Promise((ok) => setTimeout(ok, 50))
    }
  } catch (e) {
    // the SQL migration (notifications_v31.sql) may not be installed yet → stay quiet, retry later
    if (!/oddxs_notify_claim|schema cache|does not exist/i.test(String(e?.message || e) + String(e?.detail || ''))) console.warn('[ODDXS] notify tick:', e?.message || e)
  } finally { busy = false }
}

export function startNotifier() { setInterval(tick, 4000).unref?.() ; tick() }
