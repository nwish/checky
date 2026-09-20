import { useEffect, useState } from 'react'
import { api, type Checklist, type ChecklistSummary } from './api'
import IconPicker from './IconPicker'
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
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newIcon, setNewIcon] = useState(DEFAULT_CHECKLIST_ICON)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    const r = await api.checklists()
    setChecklists(r.checklists)
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

  return (
    <>
      <section className="card checklist-new-card">
        <h2>New checklist</h2>
        <p className="muted">Give it a name, then add the items you check every time.</p>
        <form onSubmit={createChecklist} className="form">
          <label>
            Title
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Kayaking trip" required maxLength={200} />
          </label>
          <label>
            Icon
            <IconPicker value={newIcon} onChange={setNewIcon} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create checklist'}</button>
        </form>
      </section>

      {checklists === null ? (
        <p className="muted checklist-section-gap">Loading…</p>
      ) : checklists.length === 0 ? (
        <p className="muted checklist-section-gap">No checklists yet — create your first one above.</p>
      ) : (
        <div className="checklist-list checklist-section-gap">
          {checklists.map((summary) => (
            <ChecklistCard
              key={summary.id}
              summary={summary}
              expanded={expandedId === summary.id}
              onToggle={() => setExpandedId(expandedId === summary.id ? null : summary.id)}
              onDeleted={handleDeleted}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </>
  )
}

function ChecklistCard({
  summary,
  expanded,
  onToggle,
  onDeleted,
  onChanged
}: {
  summary: ChecklistSummary
  expanded: boolean
  onToggle: () => void
  onDeleted: (id: number) => void
  onChanged: () => void
}) {
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [titleDraft, setTitleDraft] = useState(summary.title)
  const [newItem, setNewItem] = useState('')

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

  async function removeChecklist() {
    await api.deleteChecklist(summary.id)
    onDeleted(summary.id)
  }

  const HeaderIcon = checklistIcon(summary.icon)

  return (
    <div className="checklist-card">
      <button type="button" className={`checklist-card-header${expanded ? ' open' : ''}`} onClick={onToggle}>
        <span className="checklist-card-icon"><HeaderIcon /></span>
        <span className="checklist-card-title">{summary.title}</span>
        <span className="checklist-card-meta">{summary.checkedCount}/{summary.itemCount}</span>
        <span className="checklist-card-chevron">{icons.chevron}</span>
      </button>

      {expanded && (
        <div className="checklist-card-body">
          <label>
            Title
            <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={saveTitle} maxLength={200} />
          </label>
          <label>
            Icon
            <IconPicker value={summary.icon} onChange={saveIcon} />
          </label>

          {!checklist ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="checklist-item-list">
              {checklist.items.map((item, idx) => (
                <li key={item.id} className="checklist-item-row">
                  <input
                    className="checklist-item-text"
                    value={item.text}
                    onChange={(e) => setItemTextLocal(item.id, e.target.value)}
                    onBlur={() => saveItemText(item.id)}
                    maxLength={500}
                  />
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
                </li>
              ))}
              {checklist.items.length === 0 && <li className="muted">No items yet</li>}
            </ul>
          )}

          <form onSubmit={addItem} className="checklist-add-item-form">
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item…" maxLength={500} />
            <button type="submit">Add item</button>
          </form>

          <button type="button" className="ghost checklist-delete" onClick={removeChecklist}>
            {icons.trash}
            Delete checklist
          </button>
        </div>
      )}
    </div>
  )
}
