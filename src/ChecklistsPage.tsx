import { useEffect, useRef, useState } from 'react'
import { api, type Checklist, type ChecklistItem, type ChecklistSummary, type Share } from './api'
import { ownerLabel } from './Avatar'
import IconPicker from './IconPicker'
import SharePanel from './SharePanel'
import { checklistIcon, DEFAULT_CHECKLIST_ICON } from './icons'

const icons = {
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  up: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  ),
  grip: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<ChecklistSummary[] | null>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newIcon, setNewIcon] = useState(DEFAULT_CHECKLIST_ICON)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    const [lists, granted] = await Promise.all([api.checklists(), api.shares()])
    setChecklists(lists.checklists)
    setShares(granted.shares)
  }

  async function createChecklist(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)
    setError(null)
    try {
      const created = await api.createChecklist(title, newIcon)
      setNewTitle('')
      setNewIcon(DEFAULT_CHECKLIST_ICON)
      await refresh()
      setExpandedId(created.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  function handleDeleted(id: number) {
    if (expandedId === id) setExpandedId(null)
    refresh()
  }

  async function handleDuplicated(id: number) {
    await refresh()
    setExpandedId(id)
  }

  return (
    <>
      <section className="card checklist-new-card">
        <h2>New checklist</h2>
        <p className="muted">Give it a name, then add the items you check every time.</p>
        <form onSubmit={createChecklist} className="checklist-new-form">
          <div className="checklist-new-fields">
            <label className="checklist-new-title">
              Title
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Kayaking trip" required maxLength={200} />
            </label>
            <label className="checklist-new-icon">
              Icon
              <IconPicker value={newIcon} onChange={setNewIcon} />
            </label>
            <button type="submit" disabled={creating} className="checklist-new-submit">{creating ? 'Creating…' : 'Create checklist'}</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      {checklists === null ? (
        <p className="muted checklist-section-gap">Loading…</p>
      ) : checklists.length === 0 ? (
        <p className="muted checklist-section-gap">No checklists yet — create your first one above.</p>
      ) : (
        <>
          {renderGroup(checklists.filter((c) => c.access === 'owner'), null)}
          {checklists.some((c) => c.access !== 'owner') &&
            renderGroup(
              checklists.filter((c) => c.access !== 'owner'),
              'Shared with you'
            )}
        </>
      )}
    </>
  )

  function renderGroup(group: ChecklistSummary[], heading: string | null) {
    if (group.length === 0) return null
    return (
      <div className="checklist-section-gap">
        {heading && <h3 className="checklist-group-heading">{heading}</h3>}
        <div className="checklist-list">
          {group.map((summary) => (
            <ChecklistCard
              key={summary.id}
              summary={summary}
              shares={shares}
              expanded={expandedId === summary.id}
              onToggle={() => setExpandedId(expandedId === summary.id ? null : summary.id)}
              onDeleted={handleDeleted}
              onDuplicated={handleDuplicated}
              onChanged={refresh}
            />
          ))}
        </div>
      </div>
    )
  }
}

function ChecklistCard({
  summary,
  shares,
  expanded,
  onToggle,
  onDeleted,
  onDuplicated,
  onChanged
}: {
  summary: ChecklistSummary
  shares: Share[]
  expanded: boolean
  onToggle: () => void
  onDeleted: (id: number) => void
  onDuplicated: (id: number) => void
  onChanged: () => void
}) {
  const isOwner = summary.access === 'owner'
  const canEdit = summary.access !== 'view'
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [titleDraft, setTitleDraft] = useState(summary.title)
  const [newItem, setNewItem] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const dragRef = useRef<{ id: number; before: ChecklistItem[] } | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)

  useEffect(() => {
    setTitleDraft(summary.title)
  }, [summary.title])

  useEffect(() => {
    if (expanded && !checklist) {
      api.getChecklist(summary.id).then(setChecklist)
    }
  }, [expanded, summary.id, checklist])

  async function saveTitle() {
    const title = titleDraft.trim()
    if (!title || title === summary.title) {
      setTitleDraft(summary.title)
      return
    }
    await api.updateChecklist(summary.id, { title })
    onChanged()
  }

  async function saveIcon(icon: string) {
    await api.updateChecklist(summary.id, { icon })
    onChanged()
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const text = newItem.trim()
    if (!text) return
    const item = await api.addItem(summary.id, text)
    setChecklist((c) => (c ? { ...c, items: [...c.items, item] } : c))
    setNewItem('')
    onChanged()
  }

  function setItemTextLocal(itemId: number, text: string) {
    setChecklist((c) => (c ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, text } : i)) } : c))
  }

  async function saveItemText(itemId: number) {
    const item = checklist?.items.find((i) => i.id === itemId)
    if (!item || !item.text.trim()) return
    await api.updateItem(summary.id, itemId, { text: item.text.trim() })
    onChanged()
  }

  async function removeItem(itemId: number) {
    await api.deleteItem(summary.id, itemId)
    setChecklist((c) => (c ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c))
    onChanged()
  }

  async function moveItem(itemId: number, direction: 'up' | 'down') {
    const r = await api.moveItem(summary.id, itemId, direction)
    setChecklist((c) => (c ? { ...c, items: r.items } : c))
  }

  // Drag-to-reorder uses pointer events (not HTML5 DnD) so it also works by touch.
  // The list reorders live under the pointer; the final order is saved on release.
  function startDrag(e: React.PointerEvent<HTMLButtonElement>, itemId: number) {
    if (!checklist || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { id: itemId, before: checklist.items }
    setDraggingId(itemId)
  }

  function dragOver(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || !listRef.current) return
    const others = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-item-id]')).filter(
      (row) => Number(row.dataset.itemId) !== drag.id
    )
    const target = others.filter((row) => {
      const box = row.getBoundingClientRect()
      return e.clientY > box.top + box.height / 2
    }).length
    setChecklist((c) => {
      if (!c) return c
      const from = c.items.findIndex((i) => i.id === drag.id)
      if (from === target) return c
      const items = [...c.items]
      items.splice(target, 0, ...items.splice(from, 1))
      return { ...c, items }
    })
  }

  async function endDrag(cancelled: boolean) {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    if (!drag || !checklist) return
    const order = checklist.items.map((i) => i.id)
    const changed = order.some((id, i) => id !== drag.before[i].id)
    if (cancelled || !changed) {
      if (cancelled) setChecklist((c) => (c ? { ...c, items: drag.before } : c))
      return
    }
    try {
      const r = await api.reorderItems(summary.id, order)
      setChecklist((c) => (c ? { ...c, items: r.items } : c))
      onChanged()
    } catch {
      setChecklist((c) => (c ? { ...c, items: drag.before } : c))
    }
  }

  async function removeChecklist() {
    await api.deleteChecklist(summary.id)
    onDeleted(summary.id)
  }

  async function duplicateChecklist() {
    const copy = await api.duplicateChecklist(summary.id)
    onDuplicated(copy.id)
  }

  const HeaderIcon = checklistIcon(summary.icon)

  return (
    <div className="checklist-card">
      <button type="button" className={`checklist-card-header${expanded ? ' open' : ''}`} onClick={onToggle}>
        <span className="checklist-card-icon"><HeaderIcon /></span>
        <span className="checklist-card-title">{summary.title}</span>
        {!isOwner && <span className="checklist-card-meta share-owner">from {ownerLabel(summary)}</span>}
        <span className="checklist-card-meta">{summary.checkedCount}/{summary.itemCount}</span>
        <span className="checklist-card-chevron">{icons.chevron}</span>
      </button>

      {expanded && (
        <div className="checklist-card-body">
          {isOwner ? (
            <>
              <label>
                Title
                <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={saveTitle} maxLength={200} />
              </label>
              <label>
                Icon
                <IconPicker value={summary.icon} onChange={saveIcon} />
              </label>
            </>
          ) : (
            <p className="muted share-access-note">
              Shared by {ownerLabel(summary)} — {canEdit ? 'you can edit items' : 'you can run it but not change its items'};{' '}
              {summary.scope === 'common' ? `you work in ${ownerLabel(summary)}'s live run together.` : 'you run it on your own, with your own checks and history.'}
            </p>
          )}

          {!checklist ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="checklist-item-list" ref={listRef}>
              {checklist.items.map((item, idx) => (
                <li
                  key={item.id}
                  data-item-id={item.id}
                  className={`checklist-item-row${draggingId === item.id ? ' dragging' : ''}`}
                >
                  {canEdit && checklist.items.length > 1 && (
                    <button
                      type="button"
                      className="ghost checklist-item-grip"
                      aria-label="Drag to reorder"
                      onPointerDown={(e) => startDrag(e, item.id)}
                      onPointerMove={dragOver}
                      onPointerUp={() => endDrag(false)}
                      onPointerCancel={() => endDrag(true)}
                    >
                      {icons.grip}
                    </button>
                  )}
                  <input
                    className="checklist-item-text"
                    value={item.text}
                    onChange={(e) => setItemTextLocal(item.id, e.target.value)}
                    onBlur={() => saveItemText(item.id)}
                    maxLength={500}
                    readOnly={!canEdit}
                  />
                  {canEdit && (
                    <div className="checklist-item-actions">
                      <button type="button" className="ghost" onClick={() => moveItem(item.id, 'up')} disabled={idx === 0} aria-label="Move item up">
                        {icons.up}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => moveItem(item.id, 'down')}
                        disabled={idx === checklist.items.length - 1}
                        aria-label="Move item down"
                      >
                        {icons.down}
                      </button>
                      <button type="button" className="ghost" onClick={() => removeItem(item.id)} aria-label="Delete item">
                        {icons.trash}
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {checklist.items.length === 0 && <li className="muted">No items yet</li>}
            </ul>
          )}

          {canEdit && (
            <form onSubmit={addItem} className="checklist-add-item-form">
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item…" maxLength={500} />
              <button type="submit">Add item</button>
            </form>
          )}

          {isOwner && (
            <div className="share-section">
              <h4>Share this list</h4>
              <SharePanel checklistId={summary.id} shares={shares} onChanged={onChanged} />
            </div>
          )}

          <div className="checklist-card-actions">
            <button type="button" className="ghost" onClick={duplicateChecklist}>
              Duplicate
            </button>
            {isOwner && (
              <button type="button" className="ghost checklist-delete" onClick={removeChecklist}>
                {icons.trash}
                Delete checklist
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
