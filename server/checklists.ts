import { Router, type Response } from 'express'
import { db } from './db.js'
import { requireAuth, type AuthedRequest } from './middleware.js'

type ChecklistRow = { id: number; user_id: number; title: string; created_at: string; updated_at: string }
type ItemRow = { id: number; checklist_id: number; text: string; checked: number; position: number }
type ListRow = { id: number; title: string; updated_at: string; item_count: number; checked_count: number }

const statements = {
  listChecklists: db.prepare(
    `SELECT c.id, c.title, c.updated_at,
            COUNT(ci.id) AS item_count,
            COALESCE(SUM(ci.checked), 0) AS checked_count
       FROM checklists c
       LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC`
  ),
  findChecklist: db.prepare('SELECT id, user_id, title, created_at, updated_at FROM checklists WHERE id = ?'),
  insertChecklist: db.prepare('INSERT INTO checklists (user_id, title) VALUES (?, ?)'),
  renameChecklist: db.prepare(`UPDATE checklists SET title = ?, updated_at = datetime('now') WHERE id = ?`),
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
  resetItems: db.prepare(`UPDATE checklist_items SET checked = 0 WHERE checklist_id = ?`)
}

const TITLE_MAX = 200
const ITEM_TEXT_MAX = 500

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function serializeItem(row: ItemRow) {
  return { id: row.id, text: row.text, checked: Boolean(row.checked), position: row.position }
}

/** Loads a checklist and verifies the current user owns it. Sends 404 and returns null otherwise. */
function loadOwned(req: AuthedRequest, res: Response, id: number): ChecklistRow | null {
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'checklist not found' })
    return null
  }
  const row = statements.findChecklist.get(id) as ChecklistRow | undefined
  if (!row || row.user_id !== req.user.id) {
    res.status(404).json({ error: 'checklist not found' })
    return null
  }
  return row
}

export const checklistsRouter = Router()
checklistsRouter.use(requireAuth)

checklistsRouter.get('/', (req, res) => {
  const rows = statements.listChecklists.all((req as unknown as AuthedRequest).user.id) as ListRow[]
  res.json({
    checklists: rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updated_at,
      itemCount: r.item_count,
      checkedCount: r.checked_count
    }))
  })
})

checklistsRouter.post('/', (req, res) => {
  const title = asString((req.body as Record<string, unknown>)?.title).trim() || 'Untitled checklist'
  if (title.length > TITLE_MAX) {
    res.status(400).json({ error: `title must be ${TITLE_MAX} characters or fewer` })
    return
  }
  const info = statements.insertChecklist.run((req as unknown as AuthedRequest).user.id, title)
  const id = Number(info.lastInsertRowid)
  const row = statements.findChecklist.get(id) as ChecklistRow
  res.status(201).json({ id: row.id, title: row.title, updatedAt: row.updated_at, items: [] })
})

checklistsRouter.get('/:id', (req, res) => {
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
  if (!checklist) return
  const items = (statements.listItems.all(checklist.id) as ItemRow[]).map(serializeItem)
  res.json({ id: checklist.id, title: checklist.title, updatedAt: checklist.updated_at, items })
})

checklistsRouter.patch('/:id', (req, res) => {
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
  if (!checklist) return
  const title = asString((req.body as Record<string, unknown>)?.title).trim()
  if (!title) {
    res.status(400).json({ error: 'title cannot be empty' })
    return
  }
  if (title.length > TITLE_MAX) {
    res.status(400).json({ error: `title must be ${TITLE_MAX} characters or fewer` })
    return
  }
  statements.renameChecklist.run(title, checklist.id)
  const row = statements.findChecklist.get(checklist.id) as ChecklistRow
  res.json({ id: row.id, title: row.title, updatedAt: row.updated_at })
})

checklistsRouter.delete('/:id', (req, res) => {
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
  if (!checklist) return
  statements.deleteChecklist.run(checklist.id)
  res.json({ ok: true })
})

checklistsRouter.post('/:id/reset', (req, res) => {
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
  if (!checklist) return
  statements.resetItems.run(checklist.id)
  statements.touchChecklist.run(checklist.id)
  const items = (statements.listItems.all(checklist.id) as ItemRow[]).map(serializeItem)
  res.json({ items })
})

checklistsRouter.post('/:id/items', (req, res) => {
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
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
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
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
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
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
  const checklist = loadOwned(req as unknown as AuthedRequest, res, Number(req.params.id))
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
