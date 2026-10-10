import { useEffect, useState } from 'react'
import { api, type Checklist, type ChecklistSummary } from './api'
import { useLiveRun } from './useLive'
import Avatar, { ownerLabel, personName } from './Avatar'
import { checklistIcon } from './icons'
import LiveRunPanel from './LiveRunPanel'

const LAST_CHECKLIST_KEY = 'rerun-last-checklist'
const RESET_NOTICE_MS = 8000

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
  together: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16 14.2a4.6 4.6 0 0 1 5 4.3" />
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

export default function DashboardPage({ navigate, email }: { navigate: (to: string) => void; email: string }) {
  const [summaries, setSummaries] = useState<ChecklistSummary[] | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [resetNotice, setResetNotice] = useState<{ checked: number; total: number } | null>(null)
  const [showLive, setShowLive] = useState(false)

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

  // The confirmation belongs to the run that was just reset; drop it after a while or when switching lists.
  useEffect(() => {
    if (!resetNotice) return
    const timer = window.setTimeout(() => setResetNotice(null), RESET_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [resetNotice])

  useEffect(() => {
    setResetNotice(null)
    setShowLive(false)
  }, [activeId])

  // An invitation can arrive while this tab is in the background; pick it up when you come back.
  useEffect(() => {
    function refresh() {
      api.checklists().then((r) => setSummaries(r.checklists))
      if (activeId !== null) reloadChecklist(activeId)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [activeId])

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

  // Refetches the open list; steps back to the picker if it's gone or no longer visible.
  function reloadChecklist(id: number) {
    api
      .getChecklist(id)
      .then((fresh) => setChecklist((c) => (c && c.id === fresh.id ? fresh : c)))
      .catch(() => {
        setActiveId(null)
        api.checklists().then((r) => setSummaries(r.checklists))
      })
  }

  // Collaborators' checks arrive over a websocket; the list stays in sync without reloading.
  const refreshOpen = () => {
    if (activeId !== null) reloadChecklist(activeId)
  }
  const here = useLiveRun(checklist?.scope === 'common' ? activeId : null, { onChanged: refreshOpen, onLeft: refreshOpen })
  const others = here.filter((p) => p.email !== email)

  async function toggleItem(itemId: number, checked: boolean) {
    setResetNotice(null)
    if (!checklist) return
    setChecklist((c) => (c ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) } : c))
    try {
      await api.updateItem(checklist.id, itemId, { checked })
    } catch {
      reloadChecklist(checklist.id)
    }
  }

  async function resetChecklist() {
    if (!checklist) return
    const saved = { checked: checklist.items.filter((i) => i.checked).length, total: checklist.items.length }
    const r = await api.resetChecklist(checklist.id)
    setChecklist((c) => (c ? { ...c, items: r.items } : c))
    setResetNotice(saved)
    reloadChecklist(checklist.id) // resetting ends the live run, so the badge and who's in it change
  }

  async function joinLive() {
    if (!checklist) return
    await api.joinLiveRun(checklist.id)
    reloadChecklist(checklist.id)
    api.checklists().then((r) => setSummaries(r.checklists))
  }

  async function leaveLive() {
    if (!checklist) return
    await api.leaveLiveRun(checklist.id)
    reloadChecklist(checklist.id)
    api.checklists().then((r) => setSummaries(r.checklists))
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
        <p className="muted">Which list are you (re)running?</p>
        <div className="checklist-list">
          {summaries.map((s) => {
            const Icon = checklistIcon(s.icon)
            return (
              <button key={s.id} type="button" className="checklist-pick-card" onClick={() => setActiveId(s.id)}>
                <span className="checklist-card-icon"><Icon /></span>
                <span className="checklist-card-title">{s.title}</span>
                {s.access !== 'owner' && <span className="checklist-card-meta share-owner">from {ownerLabel(s)}</span>}
                {s.liveInvite && <span className="run-invite-tag">Live run invite</span>}
                <span className="checklist-card-meta">{s.checkedCount}/{s.itemCount}</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="ghost" onClick={() => navigate('/checklists')}>
          Manage checklists
        </button>
      </div>
    )
  }

  const total = checklist.items.length
  const done = checklist.items.filter((i) => i.checked).length
  const canEdit = checklist.access !== 'view'
  const TitleIcon = checklistIcon(checklist.icon)

  return (
    <div className="run-checklist">
      <div className="run-header">
        <div className="run-header-title">
          <span className="checklist-card-icon run-header-icon"><TitleIcon /></span>
          <div>
            <div className="run-title-row">
              <h2>{checklist.title}</h2>
              {checklist.liveWith > 0 && (
                <span className="run-live-badge" title="Everyone in this live run sees and changes the same checks">
                  <span className="run-live-dot" aria-hidden="true" />
                  Live · {checklist.liveWith + 1} people
                </span>
              )}
            </div>
            <p className="muted">
              {done}/{total} checked
              {checklist.access !== 'owner' && ` · from ${ownerLabel(checklist)} · ${checklist.scope === 'common' ? 'live run together' : 'your own run'}`}
            </p>
            {others.length > 0 && (
              <p className="muted run-presence" aria-live="polite">
                In this run now:{' '}
                {others.map((p) => (
                  <span key={p.email} className="run-presence-person" title={p.email}>
                    <Avatar person={p} className="sm" />
                    {personName(p)}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
        <div className="run-header-actions">
          <button
            type="button"
            className="ghost"
            onClick={resetChecklist}
            disabled={done === 0}
            title={checklist.liveWith > 0 ? 'Save this run to History and clear the checks for everyone in it' : 'Save this run to History and clear the checks'}
          >
            {icons.reset}
            Reset
          </button>
          {checklist.access === 'owner' && (
            <button type="button" className="ghost" aria-expanded={showLive} onClick={() => setShowLive((v) => !v)}>
              {icons.together}
              Run together
            </button>
          )}
          {checklist.liveJoined && (
            <button type="button" className="ghost" onClick={leaveLive} title="Go back to running this list on your own">
              Leave live run
            </button>
          )}
          {summaries.length > 1 && (
            <button type="button" className="ghost" onClick={() => setActiveId(null)}>
              {icons.switchList}
              Switch list
            </button>
          )}
        </div>
      </div>

      {showLive && checklist.access === 'owner' && (
        <LiveRunPanel checklistId={checklist.id} refreshKey={checklist.liveWith} onChanged={() => reloadChecklist(checklist.id)} />
      )}

      {checklist.liveInvite && (
        <p className="run-invite" role="status">
          <span className="run-invite-text">
            {ownerLabel(checklist)} invited you to run this list together. You'll all work on the same checks until the list is reset; your own checks stay as they are.
          </span>
          <button type="button" onClick={joinLive}>
            Join live run
          </button>
        </p>
      )}

      {resetNotice && (
        <p className="run-reset-notice" role="status">
          <span className="run-reset-notice-icon">{icons.checkFilled}</span>
          <span className="run-reset-notice-text">
            Run saved to History — {resetNotice.checked}/{resetNotice.total} checked. Rerun when ready!
          </span>
          <button type="button" className="link" onClick={() => navigate('/history')}>
            View in History
          </button>
        </p>
      )}

      {total === 0 ? (
        <p className="muted">
          This checklist has no items yet.{' '}
          {canEdit && (
            <>
              <button type="button" className="link" onClick={() => navigate('/checklists')}>Add some</button>.
            </>
          )}
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
