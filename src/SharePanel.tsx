import { useState } from 'react'
import { api, type Share, type SharePermission } from './api'

/**
 * Manages shares for one scope: a single checklist, or (checklistId null) all of the
 * owner's lists. `shares` is the owner's full share list; this filters to its scope.
 */
export default function SharePanel({
  checklistId,
  shares,
  onChanged
}: {
  checklistId: number | null
  shares: Share[]
  onChanged: () => void
}) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<SharePermission>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scoped = shares.filter((s) => s.checklistId === checklistId)
  // For a single list, other people may also have access through "share all".
  const inherited = checklistId === null ? [] : shares.filter((s) => s.checklistId === null && !scoped.some((p) => p.email === s.email))

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const target = email.trim()
    if (!target) return
    if (await run(() => api.putShare(target, permission, checklistId))) setEmail('')
  }

  return (
    <div className="share-panel">
      {scoped.length === 0 ? (
        <p className="muted share-empty">{checklistId === null ? 'Not shared with anyone.' : 'Not shared individually.'}</p>
      ) : (
        <ul className="share-list">
          {scoped.map((s) => (
            <li key={s.id} className="share-row">
              <span className="share-email">{s.email}</span>
              <select
                value={s.permission}
                disabled={busy}
                onChange={(e) => run(() => api.putShare(s.email, e.target.value as SharePermission, checklistId))}
                aria-label={`Access for ${s.email}`}
              >
                <option value="view">Can view</option>
                <option value="edit">Can edit</option>
              </select>
              <button type="button" className="ghost" disabled={busy} onClick={() => run(() => api.deleteShare(s.id))} aria-label={`Stop sharing with ${s.email}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {inherited.length > 0 && (
        <p className="muted share-empty">
          Also visible to {inherited.map((s) => `${s.email} (${s.permission})`).join(', ')} through “Share all lists”.
        </p>
      )}

      <form onSubmit={add} className="share-form">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email of an existing user"
          maxLength={254}
          required
          aria-label="Email to share with"
        />
        <select value={permission} onChange={(e) => setPermission(e.target.value as SharePermission)} aria-label="Access level">
          <option value="view">Can view</option>
          <option value="edit">Can edit</option>
        </select>
        <button type="submit" disabled={busy}>Share</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
