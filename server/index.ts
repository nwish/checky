import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, hashToken, newToken, verifyPassword } from './auth.js'
import { db } from './db.js'
import { inviteMail, sendMail, smtpConfigured } from './mail.js'
import { allow } from './ratelimit.js'

const isProd = process.env.NODE_ENV === 'production'
const HOST = process.env.HOST ?? '127.0.0.1'
const PORT = Number(process.env.PORT ?? 3001)

const COOKIE_NAME = 'checky_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Role = 'admin' | 'user'
type AuthedRequest = Request & { user: { id: number; email: string; role: Role } }
type UserRow = { id: number; email: string; pass_hash: string | null }
type InviteRow = { id: number; email: string; pass_hash: string | null }
type SessionRow = { user_id: number; expires_at: number; email: string; role: string }

const statements = {
  findUser: db.prepare('SELECT id, email, pass_hash FROM users WHERE email = ?'),
  countUsers: db.prepare('SELECT COUNT(*) AS c FROM users'),
  insertUser: db.prepare(
    'INSERT INTO users (email, pass_hash, role, invite_token_hash, invited_at, activated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  activateUser: db.prepare(
    "UPDATE users SET pass_hash = ?, activated_at = ?, invite_token_hash = NULL WHERE id = ? AND pass_hash IS NULL"
  ),
  setInvite: db.prepare('UPDATE users SET invite_token_hash = ?, invited_at = ? WHERE id = ?'),
  findUserByInviteToken: db.prepare('SELECT id, email, pass_hash FROM users WHERE invite_token_hash = ?'),
  listUsers: db.prepare(
    `SELECT email, role, (pass_hash IS NOT NULL) AS activated, invited_at, activated_at, created_at
       FROM users
      ORDER BY (pass_hash IS NULL) DESC, COALESCE(invited_at, 0) DESC`
  ),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  findSession: db.prepare(
    `SELECT s.user_id, s.expires_at, u.email, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?')
}
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())

// Kept so unknown-email logins take the same time as known ones.
let dummyHash: string | null = null
function timingEqualizer(): string {
  if (!dummyHash) dummyHash = hashPassword('timing-equalizer-not-a-real-password')
  return dummyHash
}

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chunk of (req.headers.cookie ?? '').split(';')) {
    const idx = chunk.indexOf('=')
    if (idx === -1) continue
    out[chunk.slice(0, idx).trim()] = decodeURIComponent(chunk.slice(idx + 1).trim())
  }
  return out
}

function startSession(res: Response, userId: number) {
  const token = newToken()
  statements.insertSession.run(hashToken(token), userId, Date.now(), Date.now() + SESSION_TTL_MS)
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.HTTPS === '1',
    path: '/'
  })
}

function readBody(req: Request): Record<string, unknown> {
  const body = req.body
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function appBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const origin = asString(req.headers.origin)
  if (origin) return origin
  return `http://localhost:${PORT}`
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, smtp: smtpConfigured() })
})

// The first account ever created becomes the admin. After that, new accounts
// only come from admin invitations.
app.post('/api/auth/register', (req, res) => {
  const body = readBody(req)
  const email = asString(body.email).trim()
  const password = asString(body.password)
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'enter a valid email' })
    return
  }
  if (password.length < 8 || password.length > 512) {
    res.status(400).json({ error: 'password must be 8-512 characters' })
    return
  }
  const { c } = statements.countUsers.get() as { c: number }
  if (c > 0) {
    res.status(403).json({ error: 'registration is closed — ask an administrator to invite you' })
    return
  }
  if (!allow(`register:${req.ip}`, 10, 15 * 60_000)) {
    res.status(429).json({ error: 'too many attempts, slow down' })
    return
  }
  let info
  try {
    info = statements.insertUser.run(email, hashPassword(password), 'admin', null, null, Date.now())
  } catch {
    res.status(409).json({ error: 'an account already exists' })
    return
  }
  startSession(res, Number(info.lastInsertRowid))
  res.status(201).json({ email, role: 'admin' })
})

app.post('/api/auth/login', (req, res) => {
  const body = readBody(req)
  const email = asString(body.email).trim()
  const password = asString(body.password)
  if (email.length > 254 || !EMAIL_RE.test(email) || password.length === 0) {
    res.status(400).json({ error: 'invalid email or password' })
    return
  }
  if (!allow(`login:${req.ip}:${email.toLowerCase()}`, 5, 5 * 60_000)) {
    res.status(429).json({ error: 'too many attempts, slow down' })
    return
  }
  const user = statements.findUser.get(email) as UserRow | undefined
  const ok = verifyPassword(password, user?.pass_hash ?? timingEqualizer())
  if (!user || user.pass_hash === null || !ok) {
    if (user && user.pass_hash === null) {
      res.status(403).json({ error: 'account not activated — use the link from your invitation email' })
      return
    }
    res.status(401).json({ error: 'invalid email or password' })
    return
  }
  startSession(res, user.id)
  res.json({ email: user.email })
})

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME]
  if (token) statements.deleteSession.run(hashToken(token))
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  const row = statements.findSession.get(hashToken(token)) as SessionRow | undefined
  if (!row || row.expires_at < Date.now()) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  ;(req as AuthedRequest).user = { id: row.user_id, email: row.email, role: row.role as Role }
  next()
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const user = (req as AuthedRequest).user
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'admin only' })
      return
    }
    next()
  })
}

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user
  res.json({ email: user.email, role: user.role })
})

// Invited user sets their password via the single-use link.
app.post('/api/auth/activate', (req, res) => {
  const body = readBody(req)
  const token = asString(body.token).trim()
  const password = asString(body.password)
  if (password.length < 8 || password.length > 512) {
    res.status(400).json({ error: 'password must be 8-512 characters' })
    return
  }
  if (token.length < 10 || token.length > 100) {
    res.status(400).json({ error: 'invitation link is invalid or has already been used' })
    return
  }
  if (!allow(`activate:${hashToken(token)}`, 5, 5 * 60_000)) {
    res.status(429).json({ error: 'too many attempts, slow down' })
    return
  }
  const pending = statements.findUserByInviteToken.get(hashToken(token)) as InviteRow | undefined
  if (!pending || pending.pass_hash !== null) {
    res.status(400).json({ error: 'invitation link is invalid or has already been used' })
    return
  }
  statements.activateUser.run(hashPassword(password), Date.now(), pending.id)
  startSession(res, pending.id)
  res.json({ email: pending.email })
})

app.post('/api/admin/invites', requireAdmin, async (req, res) => {
  const body = readBody(req)
  const email = asString(body.email).trim()
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'enter a valid email' })
    return
  }
  if (!allow(`invite:${req.ip}`, 10, 15 * 60_000)) {
    res.status(429).json({ error: 'too many attempts, slow down' })
    return
  }
  const existing = statements.findUser.get(email) as UserRow | undefined
  if (existing && existing.pass_hash !== null) {
    res.status(409).json({ error: 'a user with that email already exists' })
    return
  }

  const token = newToken()
  const now = Date.now()
  let resent = false
  if (existing) {
    // Already invited, not activated: rotate the token and resend.
    statements.setInvite.run(hashToken(token), now, existing.id)
    resent = true
  } else {
    statements.insertUser.run(email, null, 'user', hashToken(token), now, null)
  }
  const link = `${appBaseUrl(req)}/activate?token=${token}`
  const mail = inviteMail(link)
  try {
    await sendMail(email, mail.subject, mail.text, mail.html)
  } catch (err) {
    console.error(`[mail] failed to send invite to ${email}:`, err)
    res.status(502).json({ error: 'user created, but the invitation email failed to send — invite the email again to resend' })
    return
  }
  res.status(202).json({ email, resent, mail: smtpConfigured() ? 'sent' : 'logged-to-server (SMTP_HOST not set)' })
})

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const users = statements.listUsers.all() as Array<{
    email: string
    role: Role
    activated: number
    invited_at: number | null
    activated_at: number | null
    created_at: string
  }>
  res.json({
    users: users.map((u) => ({
      email: u.email,
      role: u.role,
      activated: Boolean(u.activated),
      invited_at: u.invited_at,
      activated_at: u.activated_at,
      created_at: u.created_at
    }))
  })
})

if (isProd) {
  const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  if (existsSync(distDir)) {
    app.use(express.static(distDir))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) next()
      else res.sendFile(join(distDir, 'index.html'))
    })
  }
}

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err.status === 'number' ? err.status : 500
  if (status >= 500) console.error(err)
  res.status(status).json({ error: status >= 500 ? 'internal error' : 'invalid request' })
})

app.listen(PORT, HOST, () => {
  console.log(`checky api listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  if (!smtpConfigured()) console.warn('[mail] SMTP_HOST not set — invitation emails will be logged, not sent')
})
