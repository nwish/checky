import type { NextFunction, Request, Response } from 'express'
import { hashToken } from './auth.js'
import { db } from './db.js'

export const COOKIE_NAME = 'checky_session'

export type Role = 'admin' | 'user'
export type AuthedRequest = Request & { user: { id: number; email: string; role: Role } }
type SessionRow = { user_id: number; expires_at: number; email: string; role: string }

const findSession = db.prepare(
  `SELECT s.user_id, s.expires_at, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`
)

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chunk of (req.headers.cookie ?? '').split(';')) {
    const idx = chunk.indexOf('=')
    if (idx === -1) continue
    out[chunk.slice(0, idx).trim()] = decodeURIComponent(chunk.slice(idx + 1).trim())
  }
  return out
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  const row = findSession.get(hashToken(token)) as SessionRow | undefined
  if (!row || row.expires_at < Date.now()) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  ;(req as AuthedRequest).user = { id: row.user_id, email: row.email, role: row.role as Role }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const user = (req as AuthedRequest).user
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'admin only' })
      return
    }
    next()
  })
}
