import { Router, type Request, type Response } from 'express'
import { ACCESS_RANK, resolveAccess, type Access, type Scope } from './access.js'
import { db } from './db.js'
import { ICON_SET } from './icons.js'
import { apiLimiter } from './limits.js'
import { notifyList } from './live.js'
import { requireAuth, type AuthedRequest } from './middleware.js'

type ChecklistRow = {
  id: number
  user_id: number
  title: string
  icon: string | null
  created_at: string
  updated_at: string
  owner_email: string
  owner_name: string | null
  owner_avatar: string | null
}
type LoadedChecklist = ChecklistRow & { access: Access; scope: Scope }
type ItemRow = { id: number; checklist_id: number; text: string; checked: number; position: number }
type ListRow = {
  id: number
  title: string
  icon: string | null
  updated_at: string
  owner_email: string
  owner_name: string | null
  owner_avatar: string | null
  access: Access
  scope: Scope
  item_count: number
  checked_count: number
}

const statements = {
  // Own lists plus lists shared with @me. A list-specific share overrides the owner's all-lists share.
  listChecklists: db.prepare(
    `SELECT c.id, c.title, c.icon, c.updated_at, u.email AS owner_email, u.display_name AS owner_name, u.avatar AS owner_avatar,
            CASE WHEN c.user_id = @me THEN 'owner' ELSE COALESCE(per.permission, al.permission) END AS access,
            CASE WHEN c.user_id <> @me AND COALESCE(per.mode, al.mode) = 'shared' THEN 'personal' ELSE 'common' END AS scope,
            COUNT(ci.id) AS item_count,
            COALESCE(SUM(CASE WHEN c.user_id <> @me AND COALESCE(per.mode, al.mode) = 'shared' THEN ic.item_id IS NOT NULL ELSE ci.checked END), 0) AS checked_count
       FROM checklists c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN checklist_shares per ON per.grantee_id = @me AND per.checklist_id = c.id
       LEFT JOIN checklist_shares al ON al.grantee_id = @me AND al.owner_id = c.user_id AND al.checklist_id IS NULL
       LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
       LEFT JOIN item_checks ic ON ic.item_id = ci.id AND ic.user_id = @me
      WHERE c.user_id = @me OR per.id IS NOT NULL OR al.id IS NOT NULL
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC`
  ),
  findChecklist: db.prepare(
    `SELECT c.id, c.user_id, c.title, c.icon, c.created_at, c.updated_at, u.email AS owner_email, u.display_name AS owner_name, u.avatar AS owner_avatar
       FROM checklists c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?`
  ),
  insertChecklist: db.prepare('INSERT INTO checklists (user_id, title, icon) VALUES (?, ?, ?)'),
  renameChecklist: db.prepare(`UPDATE checklists SET title = ?, updated_at = datetime('now') WHERE id = ?`),
  updateChecklistIcon: db.prepare(`UPDATE checklists SET icon = ?, updated_at = datetime('now') WHERE id = ?`),
  touchChecklist: db.prepare(`UPDATE checklists SET updated_at = datetime('now') WHERE id = ?`),
  deleteChecklist: db.prepare('DELETE FROM checklists WHERE id = ?'),

  listItems: db.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE checklist_id = ? ORDER BY position ASC, id ASC'),
  maxItemPosition: db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM checklist_items WHERE checklist_id = ?'),
  insertItem: db.prepare('INSERT INTO checklist_items (checklist_id, text, position) VALUES (?, ?, ?)'),
  findItem: db.prepare('SELECT id, checklist_id, text, checked, position FROM checklist_items WHERE id = ?'),
  updateItemText: db.prepare('UPDATE checklist_items SET text = ? WHERE id = ?'),
  updateItemChecked: db.prepare('UPDATE checklist_items SET checked = ? WHERE id = ?'),
  updateItemPosition: db.prepare('UPDATE checklist_items SET position = ? WHERE id = ?'),
  deleteItem: db.prepare('DELETE FROM checklist_items WHERE id = ?'),
  resetItems: db.prepare(`UPDATE checklist_items SET checked = 0 WHERE checklist_id = ?`),
  markRunStarted: db.prepare(`UPDATE checklists SET run_started_at = datetime('now') WHERE id = ? AND run_started_at IS NULL`),
  getRunStarted: db.prepare('SELECT run_started_at FROM checklists WHERE id = ?'),
  clearRunStarted: db.prepare('UPDATE checklists SET run_started_at = NULL WHERE id = ?'),
  insertRun: db.prepare(
    `INSERT INTO checklist_runs (checklist_id, user_id, title, started_at, total_items, checked_items, personal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ),
  snapshotRunItems: db.prepare(
    `INSERT INTO checklist_run_items (run_id, text, checked, position)
     SELECT ?, text, checked, position FROM checklist_items WHERE checklist_id = ?`
  ),
  copyItems: db.prepare(
    `INSERT INTO checklist_items (checklist_id, text, checked, position)
     SELECT ?, text, 0, position FROM checklist_items WHERE checklist_id = ?`
  ),

  // A user's own checks, for lists they run in 'shared' mode.
  listItemsPersonal: db.prepare(
    `SELECT ci.id, ci.checklist_id, ci.text, ci.position,
            EXISTS(SELECT 1 FROM item_checks k WHERE k.item_id = ci.id AND k.user_id = @me) AS checked
       FROM checklist_items ci WHERE ci.checklist_id = @id ORDER BY ci.position ASC, ci.id ASC`
  ),
  findItemPersonal: db.prepare(
    `SELECT ci.id, ci.checklist_id, ci.text, ci.position,
            EXISTS(SELECT 1 FROM item_checks k WHERE k.item_id = ci.id AND k.user_id = @me) AS checked
       FROM checklist_items ci WHERE ci.id = @id`
  ),
  setPersonalCheck: db.prepare('INSERT OR IGNORE INTO item_checks (item_id, user_id) VALUES (?, ?)'),
  clearPersonalCheck: db.prepare('DELETE FROM item_checks WHERE item_id = ? AND user_id = ?'),
  resetPersonalChecks: db.prepare(
    'DELETE FROM item_checks WHERE user_id = ? AND item_id IN (SELECT id FROM checklist_items WHERE checklist_id = ?)'
  ),
  markPersonalStarted: db.prepare('INSERT OR IGNORE INTO personal_run_starts (checklist_id, user_id) VALUES (?, ?)'),
  getPersonalStarted: db.prepare('SELECT started_at FROM personal_run_starts WHERE checklist_id = ? AND user_id = ?'),
  clearPersonalStarted: db.prepare('DELETE FROM personal_run_starts WHERE checklist_id = ? AND user_id = ?'),
  snapshotPersonalRunItems: db.prepare(
    `INSERT INTO checklist_run_items (run_id, text, checked, position)
     SELECT @run, ci.text, EXISTS(SELECT 1 FROM item_checks k WHERE k.item_id = ci.id AND k.user_id = @me), ci.position
       FROM checklist_items ci WHERE ci.checklist_id = @id`
  )
}

const TITLE_MAX = 200
const ITEM_TEXT_MAX = 500

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function serializeItem(row: ItemRow) {
  return { id: row.id, text: row.text, checked: Boolean(row.checked), position: row.position }
}

/**
 * Loads a checklist and verifies the current user has at least `need` access to it.
 * Sends 404 when it doesn't exist or isn't visible to the user, 403 when visible but
 * not permitted. Returns null in both cases.
 */
function loadChecklist(req: AuthedRequest, res: Response, id: number, need: Access): LoadedChecklist | null {
  const row = Number.isInteger(id) ? (statements.findChecklist.get(id) as ChecklistRow | undefined) : undefined
  const resolved = row ? resolveAccess(req.user.id, row.id) : null
  if (!row || !resolved) {
    res.status(404).json({ error: 'checklist not found' })
    return null
  }
  if (ACCESS_RANK[resolved.access] < ACCESS_RANK[need]) {
    res.status(403).json({ error: need === 'owner' ? 'only the owner can do that' : 'you only have view access to this checklist’s items' })
    return null
  }
  return { ...row, access: resolved.access, scope: resolved.scope }
}

/** Items with `checked` reflecting the run the user is in: the common run or their own. */
function itemsFor(checklist: LoadedChecklist, userId: number): ItemRow[] {
  return (
    checklist.scope === 'personal'
      ? statements.listItemsPersonal.all({ me: userId, id: checklist.id })
      : statements.listItems.all(checklist.id)
  ) as ItemRow[]
}

function itemFor(checklist: LoadedChecklist, userId: number, itemId: number): ItemRow {
  return (checklist.scope === 'personal' ? statements.findItemPersonal.get({ me: userId, id: itemId }) : statements.findItem.get(itemId)) as ItemRow
}

/** Tells live collaborators the list changed. `x-client-id` lets the sending tab skip refetching its own edit. */
function notifyChanged(req: Request, listId: number) {
  notifyList(listId, req.get('x-client-id') ?? undefined)
}

export const checklistsRouter = Router()
checklistsRouter.use(apiLimiter, requireAuth)

checklistsRouter.get('/', (req, res) => {
  const rows = statements.listChecklists.all({ me: (req as unknown as AuthedRequest).user.id }) as ListRow[]
  res.json({
    checklists: rows.map((r) => ({
      id: r.id,
      title: r.title,
      icon: r.icon,
      updatedAt: r.updated_at,
      access: r.access,
      scope: r.scope,
      ownerEmail: r.owner_email,
      ownerName: r.owner_name,
      ownerAvatar: r.owner_avatar,
      itemCount: r.item_count,
      checkedCount: r.checked_count
    }))
  })
})

checklistsRouter.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>
  const title = asString(body?.title).trim() || 'Untitled checklist'
  if (title.length > TITLE_MAX) {
    res.status(400).json({ error: `title must be ${TITLE_MAX} characters or fewer` })
    return
  }
  const iconInput = body?.icon
  if (iconInput !== undefined && iconInput !== null && !ICON_SET.has(asString(iconInput))) {
    res.status(400).json({ error: 'unknown icon' })
    return
  }
  const icon = typeof iconInput === 'string' ? iconInput : null
  const info = statements.insertChecklist.run((req as unknown as AuthedRequest).user.id, title, icon)
  const id = Number(info.lastInsertRowid)
  const row = statements.findChecklist.get(id) as ChecklistRow
  res.status(201).json({
    id: row.id,
    title: row.title,
    icon: row.icon,
    updatedAt: row.updated_at,
    access: 'owner',
    scope: 'common',
    ownerEmail: row.owner_email,
    ownerName: row.owner_name,
    ownerAvatar: row.owner_avatar,
    items: []
  })
})

checklistsRouter.get('/:id', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'view')
  if (!checklist) return
  const items = itemsFor(checklist, (req as unknown as AuthedRequest).user.id).map(serializeItem)
  res.json({
    id: checklist.id,
    title: checklist.title,
    icon: checklist.icon,
    updatedAt: checklist.updated_at,
    access: checklist.access,
    scope: checklist.scope,
    ownerEmail: checklist.owner_email,
    ownerName: checklist.owner_name,
    ownerAvatar: checklist.owner_avatar,
    items
  })
})

checklistsRouter.patch('/:id', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'owner')
  if (!checklist) return
  const body = req.body as Record<string, unknown>

  if (typeof body?.title === 'string') {
    const title = body.title.trim()
    if (!title) {
      res.status(400).json({ error: 'title cannot be empty' })
      return
    }
    if (title.length > TITLE_MAX) {
      res.status(400).json({ error: `title must be ${TITLE_MAX} characters or fewer` })
      return
    }
    statements.renameChecklist.run(title, checklist.id)
  }

  if ('icon' in body) {
    const iconInput = body.icon
    if (iconInput !== null && !ICON_SET.has(asString(iconInput))) {
      res.status(400).json({ error: 'unknown icon' })
      return
    }
    statements.updateChecklistIcon.run(typeof iconInput === 'string' ? iconInput : null, checklist.id)
  }

  const row = statements.findChecklist.get(checklist.id) as ChecklistRow
  notifyChanged(req, checklist.id)
  res.json({ id: row.id, title: row.title, icon: row.icon, updatedAt: row.updated_at })
})

checklistsRouter.delete('/:id', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'owner')
  if (!checklist) return
  statements.deleteChecklist.run(checklist.id)
  notifyChanged(req, checklist.id)
  res.json({ ok: true })
})

/** Copies a list the user can see (own or shared) into a new list they own. Items are copied unchecked; shares are not copied. */
checklistsRouter.post('/:id/duplicate', (req, res) => {
  const me = (req as unknown as AuthedRequest).user
  const source = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'view')
  if (!source) return
  const suffix = ' (copy)'
  const title = `${source.title.slice(0, TITLE_MAX - suffix.length)}${suffix}`
  const newId = db.transaction(() => {
    const id = Number(statements.insertChecklist.run(me.id, title, source.icon).lastInsertRowid)
    statements.copyItems.run(id, source.id)
    return id
  })()
  const row = statements.findChecklist.get(newId) as ChecklistRow
  const items = (statements.listItems.all(newId) as ItemRow[]).map(serializeItem)
  res.status(201).json({
    id: row.id,
    title: row.title,
    icon: row.icon,
    updatedAt: row.updated_at,
    access: 'owner',
    scope: 'common',
    ownerEmail: row.owner_email,
    ownerName: row.owner_name,
    ownerAvatar: row.owner_avatar,
    items
  })
})

/** Ends the user's current run on a list: records it (if anything was checked), then clears their checks. */
checklistsRouter.post('/:id/reset', (req, res) => {
  const me = (req as unknown as AuthedRequest).user
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'view')
  if (!checklist) return
  const items = itemsFor(checklist, me.id)
  const checkedCount = items.filter((i) => i.checked).length
  const personal = checklist.scope === 'personal'
  db.transaction(() => {
    if (checkedCount > 0) {
      const started = (personal ? statements.getPersonalStarted.get(checklist.id, me.id) : statements.getRunStarted.get(checklist.id)) as
        | { started_at?: string | null; run_started_at?: string | null }
        | undefined
      const startedAt = started?.started_at ?? started?.run_started_at ?? null
      const runId = Number(statements.insertRun.run(checklist.id, me.id, checklist.title, startedAt, items.length, checkedCount, personal ? 1 : 0).lastInsertRowid)
      if (personal) statements.snapshotPersonalRunItems.run({ run: runId, me: me.id, id: checklist.id })
      else statements.snapshotRunItems.run(runId, checklist.id)
    }
    if (personal) {
      statements.resetPersonalChecks.run(me.id, checklist.id)
      statements.clearPersonalStarted.run(checklist.id, me.id)
    } else {
      statements.resetItems.run(checklist.id)
      statements.clearRunStarted.run(checklist.id)
      statements.touchChecklist.run(checklist.id)
    }
  })()
  if (!personal) notifyChanged(req, checklist.id)
  res.json({ items: itemsFor(checklist, me.id).map(serializeItem) })
})

checklistsRouter.post('/:id/items', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'edit')
  if (!checklist) return
  const text = asString((req.body as Record<string, unknown>)?.text).trim()
  if (!text) {
    res.status(400).json({ error: 'item text cannot be empty' })
    return
  }
  if (text.length > ITEM_TEXT_MAX) {
    res.status(400).json({ error: `item text must be ${ITEM_TEXT_MAX} characters or fewer` })
    return
  }
  const { maxPos } = statements.maxItemPosition.get(checklist.id) as { maxPos: number }
  const info = statements.insertItem.run(checklist.id, text, maxPos + 1)
  statements.touchChecklist.run(checklist.id)
  const item = statements.findItem.get(Number(info.lastInsertRowid)) as ItemRow
  notifyChanged(req, checklist.id)
  res.status(201).json(serializeItem(item))
})

checklistsRouter.patch('/:id/items/:itemId', (req, res) => {
  const me = (req as unknown as AuthedRequest).user
  // Checking items needs only view access; changing their text needs edit.
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'view')
  if (!checklist) return
  const item = statements.findItem.get(Number(req.params.itemId)) as ItemRow | undefined
  if (!item || item.checklist_id !== checklist.id) {
    res.status(404).json({ error: 'item not found' })
    return
  }
  const body = req.body as Record<string, unknown>
  const editsText = typeof body?.text === 'string'
  if (editsText && ACCESS_RANK[checklist.access] < ACCESS_RANK.edit) {
    res.status(403).json({ error: 'you only have view access to this checklist’s items' })
    return
  }
  if (typeof body?.text === 'string') {
    const text = body.text.trim()
    if (!text) {
      res.status(400).json({ error: 'item text cannot be empty' })
      return
    }
    if (text.length > ITEM_TEXT_MAX) {
      res.status(400).json({ error: `item text must be ${ITEM_TEXT_MAX} characters or fewer` })
      return
    }
    statements.updateItemText.run(text, item.id)
  }
  if (typeof body?.checked === 'boolean') {
    if (checklist.scope === 'personal') {
      if (body.checked) {
        statements.setPersonalCheck.run(item.id, me.id)
        statements.markPersonalStarted.run(checklist.id, me.id)
      } else {
        statements.clearPersonalCheck.run(item.id, me.id)
      }
    } else {
      statements.updateItemChecked.run(body.checked ? 1 : 0, item.id)
      if (body.checked) statements.markRunStarted.run(checklist.id)
    }
  }
  // Personal checks are invisible to others, so they shouldn't reorder the owner's list.
  if (editsText || checklist.scope === 'common') statements.touchChecklist.run(checklist.id)
  if (editsText || (typeof body?.checked === 'boolean' && checklist.scope === 'common')) notifyChanged(req, checklist.id)
  res.json(serializeItem(itemFor(checklist, me.id, item.id)))
})

checklistsRouter.delete('/:id/items/:itemId', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'edit')
  if (!checklist) return
  const item = statements.findItem.get(Number(req.params.itemId)) as ItemRow | undefined
  if (!item || item.checklist_id !== checklist.id) {
    res.status(404).json({ error: 'item not found' })
    return
  }
  statements.deleteItem.run(item.id)
  statements.touchChecklist.run(checklist.id)
  notifyChanged(req, checklist.id)
  res.json({ ok: true })
})

checklistsRouter.post('/:id/items/:itemId/move', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'edit')
  if (!checklist) return
  const item = statements.findItem.get(Number(req.params.itemId)) as ItemRow | undefined
  if (!item || item.checklist_id !== checklist.id) {
    res.status(404).json({ error: 'item not found' })
    return
  }
  const direction = asString((req.body as Record<string, unknown>)?.direction)
  if (direction !== 'up' && direction !== 'down') {
    res.status(400).json({ error: "direction must be 'up' or 'down'" })
    return
  }
  const items = statements.listItems.all(checklist.id) as ItemRow[]
  const idx = items.findIndex((i) => i.id === item.id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= items.length) {
    // Already at the edge; nothing to do.
    res.json({ items: itemsFor(checklist, (req as unknown as AuthedRequest).user.id).map(serializeItem) })
    return
  }
  const neighbor = items[swapIdx]
  statements.updateItemPosition.run(neighbor.position, item.id)
  statements.updateItemPosition.run(item.position, neighbor.id)
  statements.touchChecklist.run(checklist.id)
  notifyChanged(req, checklist.id)
  res.json({ items: itemsFor(checklist, (req as unknown as AuthedRequest).user.id).map(serializeItem) })
})

// Persist a full drag-and-drop ordering. `order` must list every item id of the list exactly once.
const applyOrder = db.transaction((ids: number[]) => {
  ids.forEach((id, position) => statements.updateItemPosition.run(position, id))
})

checklistsRouter.post('/:id/items/reorder', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'edit')
  if (!checklist) return
  const order = (req.body as Record<string, unknown>)?.order
  const items = statements.listItems.all(checklist.id) as ItemRow[]
  const valid =
    Array.isArray(order) &&
    order.length === items.length &&
    new Set(order).size === order.length &&
    order.every((id) => typeof id === 'number' && items.some((i) => i.id === id))
  if (!valid) {
    res.status(400).json({ error: 'order must list every item of the checklist exactly once' })
    return
  }
  const current = items.map((i) => i.id)
  if (order.some((id, i) => id !== current[i])) {
    applyOrder(order as number[])
    statements.touchChecklist.run(checklist.id)
    notifyChanged(req, checklist.id)
  }
  res.json({ items: itemsFor(checklist, (req as unknown as AuthedRequest).user.id).map(serializeItem) })
})
