import type { IncomingHttpHeaders } from 'node:http'
import type { NextFunction, Request, Response } from 'express'
import { hashToken } from './auth.js'
import { db } from './db.js'

export const COOKIE_NAME = 'rerun_session'

export type Role = 'admin' | 'user'
export type AuthedRequest = Request & { user: { id: number; email: string; role: Role; name: string | null; avatar: string | null } }
type SessionRow = { user_id: number; expires_at: number; email: string; role: string; display_name: string | null; avatar: string | null }

const findSession = db.prepare(
  `SELECT s.user_id, s.expires_at, u.email, u.role, u.display_name, u.avatar
     FROM sessions s
     JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`
)

export function parseCookies(req: { headers: IncomingHttpHeaders }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chunk of (req.headers.cookie ?? '').split(';')) {
    const idx = chunk.indexOf('=')
    if (idx === -1) continue
    out[chunk.slice(0, idx).trim()] = decodeURIComponent(chunk.slice(idx + 1).trim())
  }
  return out
}

/** Resolves the session cookie in `headers` to a user, or null when missing, unknown or expired. */
export function authenticate(headers: IncomingHttpHeaders): { user: AuthedRequest['user']; tokenHash: string } | null {
  const token = parseCookies({ headers })[COOKIE_NAME]
  if (!token) return null
  const tokenHash = hashToken(token)
  const row = findSession.get(tokenHash) as SessionRow | undefined
  if (!row || row.expires_at < Date.now()) return null
  return { user: { id: row.user_id, email: row.email, role: row.role as Role, name: row.display_name, avatar: row.avatar }, tokenHash }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = authenticate(req.headers)
  if (!session) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  ;(req as AuthedRequest).user = session.user
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
