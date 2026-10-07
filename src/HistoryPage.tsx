import { useEffect, useState } from 'react'
import { api, type History } from './api'

const percent = (fraction: number | null) => (fraction === null ? '\u2014' : `${Math.round(fraction * 100)}%`)

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '\u2014'
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

const weekLabel = (weekStart: string) => new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function HistoryPage() {
  const [listId, setListId] = useState<number | null>(null)
  const [data, setData] = useState<History | null>(null)
  // Unfiltered list set, so the picker keeps every option while a filter is applied.
  const [lists, setLists] = useState<History['lists']>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    api
      .history(listId)
      .then((h) => {
        if (cancelled) return
        setData(h)
        setLists(h.lists)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [listId])

  if (error) return <p className="error">{error}</p>
  if (data === null) return <p className="muted">Loading…</p>

  if (lists.length === 0 && listId === null) {
    return (
      <div className="empty-state">
        <h2>No runs recorded yet</h2>
        <p>
          Run a list from the Dashboard, then reset it. Each reset that had anything checked is saved here as a run, so you can see what you finish and what you skip.
        </p>
      </div>
    )
  }

  const maxWeek = Math.max(1, ...data.weekly.map((w) => w.runs))
  const showWho = new Set(data.runs.map((r) => r.by)).size > 1
  const chartSummary = data.weekly.map((w) => `week of ${weekLabel(w.weekStart)}: ${w.runs}`).join(', ')

  return (
    <div className="history">
      <label className="history-filter">
        List
        <select value={listId ?? ''} onChange={(e) => setListId(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">All lists</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>{l.title}</option>
          ))}
        </select>
      </label>

      <div className="status-readout">
        <div className="segment">
          <span className="value">{data.summary.runs}</span>
          <span className="label">Runs</span>
        </div>
        <div className="segment">
          <span className="value">{data.summary.last30Days}</span>
          <span className="label">Last 30 days</span>
        </div>
        <div className="segment">
          <span className="value">{percent(data.summary.avgCompletion)}</span>
          <span className="label">Avg checked</span>
        </div>
        <div className="segment">
          <span className="value">{formatDuration(data.summary.avgDurationSeconds)}</span>
          <span className="label">Avg time</span>
        </div>
      </div>

      <section>
        <h3 className="checklist-group-heading">Runs per week</h3>
        <div className="history-chart" role="img" aria-label={`Runs per week. ${chartSummary}`}>
          {data.weekly.map((w, i) => (
            <div key={w.weekStart} className="history-chart-col" aria-hidden="true">
              <span className="history-chart-count">{w.runs > 0 ? w.runs : ''}</span>
              <div className="history-chart-track">
                <div className={`history-chart-bar${w.runs === 0 ? ' empty' : ''}`} style={{ height: `${(w.runs / maxWeek) * 100}%` }} />
              </div>
              <span className="history-chart-week">{i % 4 === 0 || i === data.weekly.length - 1 ? weekLabel(w.weekStart) : ''}</span>
            </div>
          ))}
        </div>
      </section>

      {listId === null && lists.length > 1 && (
        <section>
          <h3 className="checklist-group-heading">By list</h3>
          <div className="checklist-list">
            {lists.map((l) => (
              <button key={l.id} type="button" className="history-row history-list-row" onClick={() => setListId(l.id)}>
                <span className="history-row-title">{l.title}</span>
                <span className="history-row-meta">{l.runs} {l.runs === 1 ? 'run' : 'runs'}</span>
                <span className="history-row-meta">{percent(l.avgCompletion)} checked</span>
                <span className="history-row-meta history-row-wide">{formatDuration(l.avgDurationSeconds)}</span>
                <span className="history-row-meta history-row-wide">last {formatWhen(l.lastRunAt)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="checklist-group-heading">Most often missed</h3>
        {data.missed.length === 0 ? (
          <p className="muted">Nothing missed so far — every item has been checked in every run.</p>
        ) : (
          <ul className="history-missed">
            {data.missed.map((m) => (
              <li key={`${m.checklistId}:${m.text}`} className="history-row">
                <span className="history-row-title">
                  {m.text}
                  {listId === null && lists.length > 1 && <span className="history-row-sub"> · {m.listTitle}</span>}
                </span>
                <span className="history-meter" aria-hidden="true">
                  <span style={{ width: `${(m.missed / m.appeared) * 100}%` }} />
                </span>
                <span className="history-row-meta">{m.missed} of {m.appeared} runs</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="checklist-group-heading">Recent runs</h3>
        <div className="checklist-list">
          {data.runs.map((r) => (
            <details key={r.id} className="history-run">
              <summary className="history-row">
                <span className="history-row-title">
                  {r.title}
                  {showWho && <span className="history-row-sub"> · {r.by ?? 'removed user'}</span>}
                </span>
                <span className="history-row-meta">{r.checked}/{r.total}</span>
                <span className="history-row-meta history-row-wide">{formatDuration(r.durationSeconds)}</span>
                <span className="history-row-meta">{formatWhen(r.completedAt)}</span>
              </summary>
              <div className="history-run-body">
                {r.missed.length === 0 ? (
                  <p className="muted">Everything was checked.</p>
                ) : (
                  <>
                    <p className="muted">Not checked:</p>
                    <ul>
                      {r.missed.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </details>
          ))}
        </div>
        {data.summary.runs > data.runs.length && <p className="muted history-more">Showing the latest {data.runs.length} of {data.summary.runs} runs.</p>}
      </section>
    </div>
  )
}
