import { Router, type Response } from 'express'
import { db } from './db.js'
import { requireAuth, type AuthedRequest } from './middleware.js'

type Access = 'owner' | 'edit' | 'view'
type ChecklistRow = { id: number; user_id: number; title: string; icon: string | null; created_at: string; updated_at: string; owner_email: string }
type ItemRow = { id: number; checklist_id: number; text: string; checked: number; position: number }
type ListRow = { id: number; title: string; icon: string | null; updated_at: string; owner_email: string; access: Access; item_count: number; checked_count: number }

// Kept in sync with src/icons.ts's CHECKLIST_ICONS list. A fixed, curated set
// rather than free text: keeps the picker sane and rejects anything unknown.
const CHECKLIST_ICONS = [
  'Waves', 'Sailboat', 'Anchor', 'Fish', 'Droplet',
  'Tent', 'Mountain', 'Trees', 'Palmtree', 'Compass', 'Backpack', 'Snowflake', 'Sun', 'Flame',
  'Dumbbell', 'Bike',
  'Car', 'Plane', 'Luggage',
  'Home', 'Wrench', 'Hammer', 'Tractor', 'PaintRoller', 'Scissors', 'Package', 'ShoppingCart',
  'UtensilsCrossed', 'Coffee', 'Wine',
  'Briefcase', 'Book', 'Music', 'Camera', 'Baby', 'Dog', 'Heart', 'Stethoscope', 'Sparkles', 'Shirt',
  'ListChecks'
]
const CHECKLIST_ICON_SET = new Set(CHECKLIST_ICONS)

const statements = {
  // Own lists plus lists shared with @me. A list-specific share overrides the owner's all-lists share.
  listChecklists: db.prepare(
    `SELECT c.id, c.title, c.icon, c.updated_at, u.email AS owner_email,
            CASE WHEN c.user_id = @me THEN 'owner' ELSE COALESCE(per.permission, al.permission) END AS access,
            COUNT(ci.id) AS item_count,
            COALESCE(SUM(ci.checked), 0) AS checked_count
       FROM checklists c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN checklist_shares per ON per.grantee_id = @me AND per.checklist_id = c.id
       LEFT JOIN checklist_shares al ON al.grantee_id = @me AND al.owner_id = c.user_id AND al.checklist_id IS NULL
       LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
      WHERE c.user_id = @me OR per.id IS NOT NULL OR al.id IS NOT NULL
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC`
  ),
  sharedAccess: db.prepare(
    `SELECT COALESCE(
              (SELECT permission FROM checklist_shares WHERE grantee_id = @me AND checklist_id = @id),
              (SELECT permission FROM checklist_shares WHERE grantee_id = @me AND owner_id = @owner AND checklist_id IS NULL)
            ) AS permission`
  ),
  findChecklist: db.prepare(
    `SELECT c.id, c.user_id, c.title, c.icon, c.created_at, c.updated_at, u.email AS owner_email
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
  copyItems: db.prepare(
    `INSERT INTO checklist_items (checklist_id, text, checked, position)
     SELECT ?, text, 0, position FROM checklist_items WHERE checklist_id = ?`
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

const ACCESS_RANK: Record<Access, number> = { view: 1, edit: 2, owner: 3 }

/**
 * Loads a checklist and verifies the current user has at least `need` access to it.
 * Sends 404 when it doesn't exist or isn't visible to the user, 403 when visible but
 * not permitted. Returns null in both cases.
 */
function loadChecklist(req: AuthedRequest, res: Response, id: number, need: Access): (ChecklistRow & { access: Access }) | null {
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'checklist not found' })
    return null
  }
  const row = statements.findChecklist.get(id) as ChecklistRow | undefined
  let access: Access | null = null
  if (row) {
    if (row.user_id === req.user.id) {
      access = 'owner'
    } else {
      const shared = statements.sharedAccess.get({ me: req.user.id, id: row.id, owner: row.user_id }) as { permission: Access | null }
      access = shared.permission
    }
  }
  if (!row || !access) {
    res.status(404).json({ error: 'checklist not found' })
    return null
  }
  if (ACCESS_RANK[access] < ACCESS_RANK[need]) {
    res.status(403).json({ error: need === 'owner' ? 'only the owner can do that' : 'you have view-only access to this checklist' })
    return null
  }
  return { ...row, access }
}

export const checklistsRouter = Router()
checklistsRouter.use(requireAuth)

checklistsRouter.get('/', (req, res) => {
  const rows = statements.listChecklists.all({ me: (req as unknown as AuthedRequest).user.id }) as ListRow[]
  res.json({
    checklists: rows.map((r) => ({
      id: r.id,
      title: r.title,
      icon: r.icon,
      updatedAt: r.updated_at,
      access: r.access,
      ownerEmail: r.owner_email,
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
  if (iconInput !== undefined && iconInput !== null && !CHECKLIST_ICON_SET.has(asString(iconInput))) {
    res.status(400).json({ error: 'unknown icon' })
    return
  }
  const icon = typeof iconInput === 'string' ? iconInput : null
  const info = statements.insertChecklist.run((req as unknown as AuthedRequest).user.id, title, icon)
  const id = Number(info.lastInsertRowid)
  const row = statements.findChecklist.get(id) as ChecklistRow
  res.status(201).json({ id: row.id, title: row.title, icon: row.icon, updatedAt: row.updated_at, access: 'owner', ownerEmail: row.owner_email, items: [] })
})

checklistsRouter.get('/:id', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'view')
  if (!checklist) return
  const items = (statements.listItems.all(checklist.id) as ItemRow[]).map(serializeItem)
  res.json({
    id: checklist.id,
    title: checklist.title,
    icon: checklist.icon,
    updatedAt: checklist.updated_at,
    access: checklist.access,
    ownerEmail: checklist.owner_email,
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
    if (iconInput !== null && !CHECKLIST_ICON_SET.has(asString(iconInput))) {
      res.status(400).json({ error: 'unknown icon' })
      return
    }
    statements.updateChecklistIcon.run(typeof iconInput === 'string' ? iconInput : null, checklist.id)
  }

  const row = statements.findChecklist.get(checklist.id) as ChecklistRow
  res.json({ id: row.id, title: row.title, icon: row.icon, updatedAt: row.updated_at })
})

checklistsRouter.delete('/:id', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'owner')
  if (!checklist) return
  statements.deleteChecklist.run(checklist.id)
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
  res.status(201).json({ id: row.id, title: row.title, icon: row.icon, updatedAt: row.updated_at, access: 'owner', ownerEmail: row.owner_email, items })
})

checklistsRouter.post('/:id/reset', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'edit')
  if (!checklist) return
  statements.resetItems.run(checklist.id)
  statements.touchChecklist.run(checklist.id)
  const items = (statements.listItems.all(checklist.id) as ItemRow[]).map(serializeItem)
  res.json({ items })
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
  res.status(201).json(serializeItem(item))
})

checklistsRouter.patch('/:id/items/:itemId', (req, res) => {
  const checklist = loadChecklist(req as unknown as AuthedRequest, res, Number(req.params.id), 'edit')
  if (!checklist) return
  const item = statements.findItem.get(Number(req.params.itemId)) as ItemRow | undefined
  if (!item || item.checklist_id !== checklist.id) {
    res.status(404).json({ error: 'item not found' })
    return
  }
  const body = req.body as Record<string, unknown>
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
    statements.updateItemChecked.run(body.checked ? 1 : 0, item.id)
  }
  statements.touchChecklist.run(checklist.id)
  const updated = statements.findItem.get(item.id) as ItemRow
  res.json(serializeItem(updated))
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
    res.json({ items: items.map(serializeItem) })
    return
  }
  const neighbor = items[swapIdx]
  statements.updateItemPosition.run(neighbor.position, item.id)
  statements.updateItemPosition.run(item.position, neighbor.id)
  statements.touchChecklist.run(checklist.id)
  const reordered = (statements.listItems.all(checklist.id) as ItemRow[]).map(serializeItem)
  res.json({ items: reordered })
})
