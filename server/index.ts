import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from './auth.js'
import { db } from './db.js'
import { allow } from './ratelimit.js'

const isProd = process.env.NODE_ENV === 'production'
const HOST = process.env.HOST ?? '127.0.0.1'
const PORT = Number(process.env.PORT ?? 3001)

const COOKIE_NAME = 'checky_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type UserRow = { id: number; email: string; pass_hash: string }
type SessionRow = { user_id: number; expires_at: number; email: string }

const statements = {
  findUser: db.prepare('SELECT id, email, pass_hash FROM users WHERE email = ?'),
  insertUser: db.prepare('INSERT INTO users (email, pass_hash) VALUES (?, ?)'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  findSession: db.prepare(
    `SELECT s.user_id, s.expires_at, u.email
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
  const token = newSessionToken()
  statements.insertSession.run(hashSessionToken(token), userId, Date.now(), Date.now() + SESSION_TTL_MS)
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.HTTPS === '1',
    path: '/'
  })
}

function readBody(req: Request): { email: string; password: string } {
  const body = (req.body ?? {}) as Record<string, unknown>
  return {
    email: typeof body.email === 'string' ? body.email.trim() : '',
    password: typeof body.password === 'string' ? body.password : ''
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/register', (req, res) => {
  const { email, password } = readBody(req)
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'enter a valid email' })
    return
  }
  if (password.length < 8 || password.length > 512) {
    res.status(400).json({ error: 'password must be 8-512 characters' })
    return
  }
  if (!allow(`register:${req.ip}:${email.toLowerCase()}`, 10, 15 * 60_000)) {
    res.status(429).json({ error: 'too many attempts, slow down' })
    return
  }
  if (statements.findUser.get(email) !== undefined) {
    res.status(409).json({ error: 'email already in use' })
    return
  }
  let info
  try {
    info = statements.insertUser.run(email, hashPassword(password))
  } catch {
    // Lost a race against a concurrent register for the same email.
    res.status(409).json({ error: 'email already in use' })
    return
  }
  startSession(res, Number(info.lastInsertRowid))
  res.status(201).json({ email })
})

app.post('/api/auth/login', (req, res) => {
  const { email, password } = readBody(req)
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
  if (!user || !ok) {
    res.status(401).json({ error: 'invalid email or password' })
    return
  }
  startSession(res, user.id)
  res.json({ email: user.email })
})

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME]
  if (token) statements.deleteSession.run(hashSessionToken(token))
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  const row = statements.findSession.get(hashSessionToken(token)) as SessionRow | undefined
  if (!row || row.expires_at < Date.now()) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  ;(req as Request & { user: { id: number; email: string } }).user = { id: row.user_id, email: row.email }
  next()
}

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ email: (req as Request & { user: { id: number; email: string } }).user.email })
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
})
