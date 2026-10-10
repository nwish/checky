import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, type Checklist, type ChecklistItem, type ChecklistSummary, type Share } from './api'
import { ownerLabel } from './Avatar'
import IconPicker from './IconPicker'
import Modal from './Modal'
import SharePanel from './SharePanel'
import { checklistIcon, DEFAULT_CHECKLIST_ICON } from './icons'

const icons = {
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
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
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
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

export default function ChecklistsPage({ navigate }: { navigate: (to: string) => void }) {
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
              onManageAll={() => navigate('/settings')}
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
  onManageAll,
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
  onManageAll: () => void
}) {
  const isOwner = summary.access === 'owner'
  const canEdit = summary.access !== 'view'
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [titleDraft, setTitleDraft] = useState(summary.title)
  const [newItem, setNewItem] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  // grabOffset: pointer distance below the row's top edge when grabbed. pointerY: latest clientY.
  const dragRef = useRef<{ id: number; before: ChecklistItem[]; grabOffset: number; pointerY: number } | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)

  // The grabbed row is lifted out of the flow visually (transform) and tracks the pointer,
  // while its slot in the list shows where it will land. offsetTop ignores transforms, so
  // this stays correct as the neighbours reorder underneath it.
  function liftDraggedRow() {
    const drag = dragRef.current
    const list = listRef.current
    if (!drag || !list) return
    const row = list.querySelector<HTMLElement>(`[data-item-id="${drag.id}"]`)
    const card = row?.firstElementChild as HTMLElement | null
    if (!row || !card) return
    const dy = drag.pointerY - list.getBoundingClientRect().top - drag.grabOffset - row.offsetTop
    card.style.transform = `translateY(${dy}px) scale(1.02) rotate(-0.6deg)`
  }

  useLayoutEffect(liftDraggedRow, [checklist?.items])

  // Track the drag on the window, not the handle: reordering moves the handle in the DOM,
  // which drops pointer capture, so the handle itself would stop receiving move/up events.
  const dragHandlers = useRef({ move: dragOver, end: endDrag })
  dragHandlers.current = { move: dragOver, end: endDrag }
  useEffect(() => {
    if (draggingId === null) return
    const move = (e: PointerEvent) => dragHandlers.current.move(e)
    const up = () => dragHandlers.current.end(false)
    const cancel = () => dragHandlers.current.end(true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [draggingId])
  const [sharing, setSharing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  // Drag-to-reorder uses pointer events (not HTML5 DnD) so it also works by touch.
  // The list reorders live under the pointer; the final order is saved on release.
  function startDrag(e: React.PointerEvent<HTMLButtonElement>, itemId: number) {
    if (!checklist || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const row = e.currentTarget.closest('li')!
    dragRef.current = {
      id: itemId,
      before: checklist.items,
      grabOffset: e.clientY - row.getBoundingClientRect().top,
      pointerY: e.clientY
    }
    setDraggingId(itemId)
  }

  function dragOver(e: { clientY: number }) {
    const drag = dragRef.current
    if (!drag || !listRef.current) return
    drag.pointerY = e.clientY
    liftDraggedRow()
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
    if (drag) listRef.current?.querySelector<HTMLElement>(`[data-item-id="${drag.id}"] > .checklist-item-card`)?.style.removeProperty('transform')
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
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteChecklist(summary.id)
      onDeleted(summary.id)
    } catch (err) {
      setDeleteError((err as Error).message)
      setDeleting(false)
    }
  }

  function closeDeleteDialog() {
    if (deleting) return
    setConfirmingDelete(false)
    setDeleteError(null)
  }

  async function duplicateChecklist() {
    const copy = await api.duplicateChecklist(summary.id)
    onDuplicated(copy.id)
  }

  const HeaderIcon = checklistIcon(summary.icon)
  // People with access to this list: shared on it directly, or through "Share all lists".
  const sharedWith = new Set(shares.filter((s) => s.checklistId === summary.id || s.checklistId === null).map((s) => s.email)).size

  return (
    <div className="checklist-card">
      <div className={`checklist-card-header${expanded ? ' open' : ''}`} onClick={onToggle}>
        {/* The toggle button gives keyboard users a focus target; a mouse click anywhere on the
            row (including the count and chevron) reaches the row's onClick through bubbling. */}
        <button type="button" className="checklist-card-toggle" aria-expanded={expanded}>
          <span className="checklist-card-icon"><HeaderIcon /></span>
          <span className="checklist-card-title">{summary.title}</span>
          {!isOwner && <span className="checklist-card-meta share-owner">from {ownerLabel(summary)}</span>}
        </button>
        <span className="checklist-card-meta">{summary.itemCount}</span>
        {isOwner && (
          <button
            type="button"
            className="checklist-card-share"
            aria-haspopup="dialog"
            aria-label={sharedWith === 0 ? 'Share this list' : `Shared with ${sharedWith} ${sharedWith === 1 ? 'person' : 'people'}`}
            title={sharedWith === 0 ? 'Share this list' : `Shared with ${sharedWith} ${sharedWith === 1 ? 'person' : 'people'}`}
            onClick={(e) => {
              e.stopPropagation()
              setSharing(true)
            }}
          >
            {icons.share}
            {sharedWith > 0 && <span className="checklist-card-share-count">{sharedWith}</span>}
          </button>
        )}
        <span className="checklist-card-chevron">{icons.chevron}</span>
      </div>

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
              {checklist.items.map((item) => (
                <li
                  key={item.id}
                  data-item-id={item.id}
                  className={`checklist-item-row${draggingId === item.id ? ' dragging' : ''}`}
                >
                  <div className="checklist-item-card">
                    {canEdit && checklist.items.length > 1 && (
                      <button
                        type="button"
                        className="ghost checklist-item-grip"
                        aria-label="Drag to reorder"
                        onPointerDown={(e) => startDrag(e, item.id)}
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
                        <button type="button" className="ghost" onClick={() => removeItem(item.id)} aria-label="Delete item">
                          {icons.trash}
                        </button>
                      </div>
                    )}
                  </div>
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

          <div className="checklist-card-actions">
            <button type="button" className="ghost" onClick={duplicateChecklist}>
              Duplicate
            </button>
            {isOwner && (
              <button type="button" className="ghost checklist-delete" onClick={() => setConfirmingDelete(true)}>
                {icons.trash}
                Delete checklist
              </button>
            )}
          </div>
        </div>
      )}

      {sharing && (
        <Modal title={`Share “${summary.title}”`} onClose={() => setSharing(false)} className="share-modal">
          <SharePanel checklistId={summary.id} shares={shares} onChanged={onChanged} onManageAll={onManageAll} />
        </Modal>
      )}

      {confirmingDelete && (
        <Modal title={`Delete “${summary.title}”?`} onClose={closeDeleteDialog}>
          <p className="muted">
            This permanently deletes the list{summary.itemCount > 0 ? ` and its ${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}` : ''},
            its run history, and{sharedWith > 0 ? ` its sharing with ${sharedWith} ${sharedWith === 1 ? 'person' : 'people'}` : ' any sharing'}. It can’t be undone.
          </p>
          {deleteError && (
            <p className="error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={closeDeleteDialog} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="ghost danger" onClick={removeChecklist} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete list'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
