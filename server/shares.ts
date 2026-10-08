import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { db } from './db.js'
import { apiLimiter } from './limits.js'
import { notifyOwner } from './live.js'
import { requireAuth, type AuthedRequest } from './middleware.js'

type Permission = 'view' | 'edit'
type Mode = 'shared' | 'collaborative'
type ShareRow = { id: number; email: string; permission: Permission; mode: Mode; checklist_id: number | null }

const statements = {
  listShares: db.prepare(
    `SELECT s.id, u.email, s.permission, s.mode, s.checklist_id
       FROM checklist_shares s
       JOIN users u ON u.id = s.grantee_id
      WHERE s.owner_id = ?
      ORDER BY u.email, s.id`
  ),
  // Only fully activated accounts (password set) can receive shares.
  findActiveUser: db.prepare('SELECT id FROM users WHERE email = ? AND pass_hash IS NOT NULL'),
  findOwnedChecklist: db.prepare('SELECT id FROM checklists WHERE id = ? AND user_id = ?'),
  findShare: db.prepare(
    'SELECT id FROM checklist_shares WHERE owner_id = ? AND grantee_id = ? AND COALESCE(checklist_id, 0) = COALESCE(?, 0)'
  ),
  insertShare: db.prepare('INSERT INTO checklist_shares (owner_id, grantee_id, checklist_id, permission, mode) VALUES (?, ?, ?, ?, ?)'),
  updateShare: db.prepare('UPDATE checklist_shares SET permission = ?, mode = ? WHERE id = ?'),
  getShare: db.prepare(
    `SELECT s.id, u.email, s.permission, s.mode, s.checklist_id
       FROM checklist_shares s JOIN users u ON u.id = s.grantee_id
      WHERE s.id = ?`
  ),
  deleteShare: db.prepare('DELETE FROM checklist_shares WHERE id = ? AND owner_id = ?')
}

function serialize(row: ShareRow) {
  return { id: row.id, email: row.email, permission: row.permission, mode: row.mode, checklistId: row.checklist_id }
}

// Unknown vs. known emails produce different errors, so keep guessing slow.
const shareLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'too many attempts, slow down' }
})

export const sharesRouter = Router()
sharesRouter.use(apiLimiter, requireAuth)

/** Shares the current user has granted: list-specific (checklistId set) and all-lists (checklistId null). */
sharesRouter.get('/', (req, res) => {
  const me = (req as unknown as AuthedRequest).user
  res.json({ shares: (statements.listShares.all(me.id) as ShareRow[]).map(serialize) })
})

/** Creates or updates a share. checklistId omitted/null shares every list, including future ones. */
sharesRouter.put('/', shareLimiter, (req, res) => {
  const me = (req as unknown as AuthedRequest).user
  const raw = req.body
  const body: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email || email.length > 254) {
    res.status(400).json({ error: 'email is required' })
    return
  }
  if (body.permission !== 'view' && body.permission !== 'edit') {
    res.status(400).json({ error: "permission must be 'view' or 'edit'" })
    return
  }
  const permission: Permission = body.permission
  if (body.mode !== 'shared' && body.mode !== 'collaborative') {
    res.status(400).json({ error: "mode must be 'shared' or 'collaborative'" })
    return
  }
  const mode: Mode = body.mode

  let checklistId: number | null = null
  if (body.checklistId !== undefined && body.checklistId !== null) {
    if (typeof body.checklistId !== 'number' || !Number.isInteger(body.checklistId)) {
      res.status(400).json({ error: 'invalid checklistId' })
      return
    }
    if (!statements.findOwnedChecklist.get(body.checklistId, me.id)) {
      res.status(404).json({ error: 'checklist not found' })
      return
    }
    checklistId = body.checklistId
  }

  const grantee = statements.findActiveUser.get(email) as { id: number } | undefined
  if (!grantee) {
    res.status(404).json({ error: 'no active user with that email' })
    return
  }
  if (grantee.id === me.id) {
    res.status(400).json({ error: "you can't share with yourself" })
    return
  }

  const existing = statements.findShare.get(me.id, grantee.id, checklistId) as { id: number } | undefined
  let id: number
  if (existing) {
    statements.updateShare.run(permission, mode, existing.id)
    id = existing.id
  } else {
    id = Number(statements.insertShare.run(me.id, grantee.id, checklistId, permission, mode).lastInsertRowid)
  }
  notifyOwner(me.id) // a revoked or re-moded grantee must leave the live run
  res.status(existing ? 200 : 201).json(serialize(statements.getShare.get(id) as ShareRow))
})

sharesRouter.delete('/:id', (req, res) => {
  const me = (req as unknown as AuthedRequest).user
  const info = statements.deleteShare.run(Number(req.params.id), me.id)
  if (info.changes === 0) {
    res.status(404).json({ error: 'share not found' })
    return
  }
  notifyOwner(me.id)
  res.json({ ok: true })
})
