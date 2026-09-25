import express from 'express'
import { Telegraf } from 'telegraf'
import compression from 'compression'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import authMe from './api/auth/me.js'
import dailyCheckin from './api/daily-checkin.js'
import tasksComplete from './api/tasks/complete.js'
import tasksManage from './api/tasks/manage.js'
import tasksList from './api/tasks/list.js'
import profileWallet from './api/profile/wallet.js'
import withdraw from './api/withdraw.js'
import exchange from './api/exchange.js'
import leaderboard from './api/leaderboard.js'
import adminBroadcast from './api/admin/broadcast.js'
import adminWithdrawals from './api/admin/withdrawals.js'
import adminWithdrawalsStatus from './api/admin/withdrawals/status.js'
import adminGiftCodes from './api/admin/gift-codes.js'
import giftCodesRedeem from './api/gift-codes/redeem.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.set('trust proxy', true)
app.use(compression())
app.use(express.json({ limit: '15mb' }))

const wrap = (handler) => (req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    console.error(err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
  })
}

app.all('/api/auth/me', wrap(authMe))
app.all('/api/daily-checkin', wrap(dailyCheckin))
app.all('/api/tasks/complete', wrap(tasksComplete))
app.all('/api/tasks/manage', wrap(tasksManage))
app.all('/api/tasks/list', wrap(tasksList))
app.all('/api/profile/wallet', wrap(profileWallet))
app.all('/api/withdraw', wrap(withdraw))
app.all('/api/exchange', wrap(exchange))
app.all('/api/leaderboard', wrap(leaderboard))
app.all('/api/admin/broadcast', wrap(adminBroadcast))
app.all('/api/admin/withdrawals/status', wrap(adminWithdrawalsStatus))
app.all('/api/admin/withdrawals', wrap(adminWithdrawals))
app.all('/api/admin/gift-codes', wrap(adminGiftCodes))
app.all('/api/gift-codes/redeem', wrap(giftCodesRedeem))

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'stormy' })
})

const distDir = path.join(__dirname, 'dist')
app.use(express.static(distDir, { maxAge: '1y', immutable: true, index: false }))

app.get(['/admin', '/admin.html'], (_req, res) => {
  res.sendFile(path.join(distDir, 'admin.html'))
})

app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
  res.sendFile(path.join(distDir, 'index.html'))
})

const PORT = Number(process.env.PORT || 3000)
const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

if (botToken) {
  const bot = new Telegraf(botToken)
  const webAppUrl = process.env.WEBAPP_URL

  bot.start(async (ctx) => {
    const text = 'Welcome to ComicX 🚀'
    if (!webAppUrl) return ctx.reply(text)
    return ctx.reply(text, {
      reply_markup: { inline_keyboard: [[{ text: '🚀 Open ComicX', web_app: { url: webAppUrl } }]] },
    })
  })

  bot.command('admin', async (ctx) => {
    if (!webAppUrl) return ctx.reply('Admin panel is not configured.')
    return ctx.reply('Admin panel:', {
      reply_markup: {
        inline_keyboard: [[{
          text: '🛠️ Open Admin Panel',
          web_app: { url: `${webAppUrl.replace(/\/$/, '')}/admin.html` },
        }]],
      },
    })
  })

  bot.catch((err) => console.error('Telegram bot error:', err))
  bot.launch().then(() => console.log('Telegram bot started')).catch((err) => console.error('Telegram bot failed to start:', err))

  const shutdown = (signal) => {
    try { bot.stop(signal) } catch {}
    process.exit(0)
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
} else {
  console.warn('BOT_TOKEN/TELEGRAM_BOT_TOKEN is not configured; web app API remains available.')
}
