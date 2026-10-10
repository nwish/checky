import { useEffect, useState } from 'react'
import { api, type LivePerson } from './api'
import Avatar, { personName } from './Avatar'

const STATE_LABEL = { none: '', invited: 'Invited — waiting to join', joined: 'In the run' } as const

/**
 * Lets a list's owner invite people into one live run of it. Only people who run the list on their own
 * ('shared' mode) can be invited; people shared in 'collaborative' mode are always in the run. The run
 * ends, and everyone goes back to their own checks, when the list is reset or the owner ends it.
 * `refreshKey` changes when someone joins or leaves, so the statuses stay current.
 */
export default function LiveRunPanel({ checklistId, refreshKey, onChanged }: { checklistId: number; refreshKey: number; onChanged: () => void }) {
  const [people, setPeople] = useState<LivePerson[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .liveRun(checklistId)
      .then((r) => setPeople(r.people))
      .catch((err) => setError((err as Error).message))
  }, [checklistId, refreshKey])

  async function apply(action: () => Promise<{ people: LivePerson[] }>) {
    setBusy(true)
    setError(null)
    try {
      setPeople((await action()).people)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The panel edits one declarative set: everyone who should be invited after this click.
  function toggle(person: LivePerson) {
    if (!people) return
    const invited = people.filter((p) => p.mode === 'shared' && (p.email === person.email ? p.state === 'none' : p.state !== 'none')).map((p) => p.email)
    apply(() => api.setLiveRun(checklistId, invited))
  }

  if (people === null) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>

  const invitable = people.filter((p) => p.mode === 'shared')
  const anyone = people.some((p) => p.mode === 'shared' && p.state !== 'none')

  return (
    <section className="live-panel" aria-label="Run together">
      <p className="muted live-panel-intro">
        Invite people who run this list on their own into one live run. You all check the same items until you reset the list or end the run;
        their own checks aren't touched.
      </p>
      {people.length === 0 ? (
        <p className="muted">Nobody has this list yet. Use the share icon on the Checklists page to share it first.</p>
      ) : (
        <ul className="live-people">
          {people.map((p) => (
            <li key={p.email}>
              {p.mode === 'collaborative' ? (
                <div className="live-person">
                  <Avatar person={p} className="sm" />
                  <span className="live-person-name" title={p.email}>{personName(p)}</span>
                  <span className="muted live-person-status">Always runs it with you</span>
                </div>
              ) : (
                <label className="live-person">
                  <input type="checkbox" checked={p.state !== 'none'} disabled={busy} onChange={() => toggle(p)} />
                  <Avatar person={p} className="sm" />
                  <span className="live-person-name" title={p.email}>{personName(p)}</span>
                  <span className="muted live-person-status">{STATE_LABEL[p.state]}</span>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
      {invitable.length === 0 && people.length > 0 && <p className="muted">Everyone you've shared this list with already runs it with you.</p>}
      {anyone && (
        <button type="button" className="ghost live-end" disabled={busy} onClick={() => apply(() => api.endLiveRun(checklistId))}>
          End live run
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
