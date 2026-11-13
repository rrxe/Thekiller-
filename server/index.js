import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { me, authMe, game, withdraw, exchange, tasks, leaderboard } from './api/player.js'
import admin from './api/admin.js'
import { handleTelegramWebhook, setupTelegramWebhook } from './lib/telegram-bot.js'
import { rpc } from './lib/supabase.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = express()
app.set('trust proxy', true)
app.disable('x-powered-by')
app.use(compression())
app.use(express.json({ limit: '200kb' }))

const wrap = (h) => (req, res) => Promise.resolve(h(req, res)).catch((e) => {
  console.error('[ODDXS] unhandled:', e)
  if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' })
})

app.get('/health', (_q, r) => r.json({ ok: true, app: 'ODDXS' }))
app.get('/health/ready', async (_q, r) => {
  try {
    await rpc('oddxs_public_settings')
    let exchange = true
    try { await rpc('oddxs_my_exchanges', { p_tid: '0', p_limit: 1 }) }
    catch { exchange = false }
    return r.json({ ok: true, database: true, exchange })
  } catch (e) {
    console.error('[ODDXS] readiness check failed:', e?.message || e)
    return r.status(503).json({ ok: false, database: false, error: 'database_unavailable' })
  }
})
app.all('/api/me', wrap(me))
app.all('/api/auth/me', wrap(authMe))
app.post('/api/game', wrap(game))
app.all('/api/withdraw', wrap(withdraw))
app.post('/api/exchange', wrap(exchange))
app.post('/api/tasks', wrap(tasks))
app.all('/api/leaderboard', wrap(leaderboard))
app.all('/api/admin', wrap(admin))
app.post('/api/telegram/webhook', wrap(handleTelegramWebhook))

app.get(['/admin', '/admin.html'], (_q, r) => r.sendFile(path.join(root, 'public', 'admin.html')))
const dist = path.join(root, 'dist')
app.use(express.static(dist, { maxAge: '1d', index: false, setHeaders: (res, f) => f.endsWith('.html') && res.setHeader('Cache-Control', 'no-store') }))
app.get(/.*/, (req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'not_found' }) : res.sendFile(path.join(dist, 'index.html')))

const port = Number(process.env.PORT || 3000)
app.listen(port, () => {
  console.log(`[ODDXS] listening on :${port}`)
  setupTelegramWebhook().catch((e) => console.warn('[ODDXS] webhook setup failed:', e?.message || e))
})
