import { useId, useState } from 'react'
import { api, type Share, type SharePermission, type ShareMode } from './api'
import Avatar, { personName } from './Avatar'

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
  const [mode, setMode] = useState<ShareMode>('shared')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const addErrorId = useId()

  const scoped = shares.filter((s) => s.checklistId === checklistId)
  // For a single list, other people may also have access through "share all".
  const inherited = checklistId === null ? [] : shares.filter((s) => s.checklistId === null && !scoped.some((p) => p.email === s.email))

  // Failures of the add form show under the email field (setAddError); other actions use the panel-level error.
  async function run(action: () => Promise<unknown>, setFailure: (message: string | null) => void = setError) {
    setBusy(true)
    setFailure(null)
    try {
      await action()
      onChanged()
      return true
    } catch (err) {
      setFailure((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const target = email.trim()
    if (!target) return
    if (await run(() => api.putShare(target, permission, mode, checklistId), setAddError)) setEmail('')
  }

  return (
    <div className="share-panel">
      {scoped.length === 0 ? (
        <p className="muted share-empty">{checklistId === null ? 'Not shared with anyone.' : 'Not shared individually.'}</p>
      ) : (
        <ul className="share-list">
          {scoped.map((s) => (
            <li key={s.id} className="share-row">
              <Avatar person={s} className="sm" />
              <span className="share-email" title={s.email}>{s.name ? `${s.name} (${s.email})` : s.email}</span>
              <select
                value={s.permission}
                disabled={busy}
                onChange={(e) => run(() => api.putShare(s.email, e.target.value as SharePermission, s.mode, checklistId))}
                aria-label={`Item access for ${s.email}`}
              >
                <option value="view">View items</option>
                <option value="edit">Edit items</option>
              </select>
              <select
                value={s.mode}
                disabled={busy}
                onChange={(e) => run(() => api.putShare(s.email, s.permission, e.target.value as ShareMode, checklistId))}
                aria-label={`Run mode for ${s.email}`}
              >
                <option value="shared">Shared</option>
                <option value="collaborative">Collaborative</option>
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
          Also visible to {inherited.map((s) => `${personName(s)} (${s.mode})`).join(', ')} through “Share all lists”.
        </p>
      )}

      <form onSubmit={add} className="share-form">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setAddError(null)
          }}
          placeholder="Email of an existing user"
          maxLength={254}
          required
          aria-label="Email to share with"
          aria-invalid={addError !== null}
          aria-describedby={addError ? addErrorId : undefined}
        />
        {addError && (
          <p id={addErrorId} className="error share-form-error" role="alert">
            {addError}
          </p>
        )}
        <select value={permission} onChange={(e) => setPermission(e.target.value as SharePermission)} aria-label="Item access">
          <option value="view">View items</option>
          <option value="edit">Edit items</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as ShareMode)} aria-label="Run mode">
          <option value="shared">Shared</option>
          <option value="collaborative">Collaborative</option>
        </select>
        <button type="submit" disabled={busy}>Share</button>
      </form>
      <p className="muted share-legend">
        <strong>Shared:</strong> they run the list with their own checks and history. <strong>Collaborative:</strong> you work in the same live run. “View items” can still check items and reset; “Edit items” can also change the list.
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
