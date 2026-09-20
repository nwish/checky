import { useEffect, useState } from 'react'
import { api, type Checklist, type ChecklistSummary } from './api'

const LAST_CHECKLIST_KEY = 'checky-last-checklist'

const icons = {
  checkEmpty: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4" />
    </svg>
  ),
  checkFilled: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  ),
  switchList: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h13" />
      <path d="m12 7 5 5-5 5" />
      <path d="M21 6v12" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

export default function DashboardPage({ navigate }: { navigate: (to: string) => void }) {
  const [summaries, setSummaries] = useState<ChecklistSummary[] | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [checklist, setChecklist] = useState<Checklist | null>(null)

  useEffect(() => {
    api.checklists().then((r) => {
      setSummaries(r.checklists)
      const lastId = Number(window.localStorage.getItem(LAST_CHECKLIST_KEY))
      if (lastId && r.checklists.some((c) => c.id === lastId)) {
        setActiveId(lastId)
      } else if (r.checklists.length === 1) {
        setActiveId(r.checklists[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (activeId === null) {
      setChecklist(null)
      return
    }
    api.getChecklist(activeId).then(setChecklist)
    try {
      window.localStorage.setItem(LAST_CHECKLIST_KEY, String(activeId))
    } catch {
      // best-effort only
    }
  }, [activeId])

  async function toggleItem(itemId: number, checked: boolean) {
    if (!checklist) return
    setChecklist((c) => (c ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) } : c))
    await api.updateItem(checklist.id, itemId, { checked })
  }

  async function resetChecklist() {
    if (!checklist) return
    const r = await api.resetChecklist(checklist.id)
    setChecklist((c) => (c ? { ...c, items: r.items } : c))
  }

  if (summaries === null) return <p className="muted">Loading…</p>

  if (summaries.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <h2>Your checklist workspace is on its way</h2>
        <p>
          Build a checklist for anything you do again and again, then run through it whenever it's time.
          This is where your lists will live.
        </p>
        <button type="button" onClick={() => navigate('/checklists')}>
          Create your first checklist
        </button>
      </div>
    )
  }

  if (!checklist || activeId === null) {
    return (
      <div className="checklist-picker">
        <p className="muted">Which list are you running?</p>
        <div className="checklist-list">
          {summaries.map((s) => (
            <button key={s.id} type="button" className="checklist-pick-card" onClick={() => setActiveId(s.id)}>
              <span className="checklist-card-title">{s.title}</span>
              <span className="checklist-card-meta">{s.checkedCount}/{s.itemCount}</span>
            </button>
          ))}
        </div>
        <button type="button" className="ghost" onClick={() => navigate('/checklists')}>
          Manage checklists
        </button>
      </div>
    )
  }

  const total = checklist.items.length
  const done = checklist.items.filter((i) => i.checked).length

  return (
    <div className="run-checklist">
      <div className="run-header">
        <div>
          <h2>{checklist.title}</h2>
          <p className="muted">{done}/{total} checked</p>
        </div>
        <div className="run-header-actions">
          <button type="button" className="ghost" onClick={resetChecklist} disabled={done === 0}>
            {icons.reset}
            Reset
          </button>
          {summaries.length > 1 && (
            <button type="button" className="ghost" onClick={() => setActiveId(null)}>
              {icons.switchList}
              Switch list
            </button>
          )}
        </div>
      </div>

      {total === 0 ? (
        <p className="muted">
          This checklist has no items yet. <button type="button" className="link" onClick={() => navigate('/checklists')}>Add some</button>.
        </p>
      ) : (
        <ul className="run-item-list">
          {checklist.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`run-item${item.checked ? ' checked' : ''}`}
                onClick={() => toggleItem(item.id, !item.checked)}
              >
                <span className="run-item-check">{item.checked ? icons.checkFilled : icons.checkEmpty}</span>
                <span className="run-item-text">{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
