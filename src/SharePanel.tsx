import { useEffect, useId, useRef, useState } from 'react'
import { api, type Share, type SharePermission, type ShareMode } from './api'
import Avatar, { personName } from './Avatar'

const ACCESS_LABEL: Record<SharePermission, string> = { view: 'View items', edit: 'Edit items' }
const MODE_LABEL: Record<ShareMode, string> = { shared: 'Shared', collaborative: 'Collaborative' }

/**
 * Manages shares for one scope: a single checklist, or (checklistId null) all of the
 * owner's lists. `shares` is the owner's full share list; this filters to its scope.
 */
export default function SharePanel({
  checklistId,
  shares,
  onChanged,
  onManageAll
}: {
  checklistId: number | null
  shares: Share[]
  onChanged: () => void
  /** Where people shared on every list are managed; shown as a link when this panel lists them. */
  onManageAll?: () => void
}) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<SharePermission>('view')
  const [mode, setMode] = useState<ShareMode>('shared')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const addErrorId = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  // The most recently removed share, kept briefly so it can be undone.
  const [removed, setRemoved] = useState<Share | null>(null)

  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(() => setRemoved(null), 8000)
    return () => clearTimeout(timer)
  }, [removed])

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
    const added = await run(() => api.putShare(target, permission, mode, checklistId), setAddError)
    if (added) setEmail('')
    // Back to the field either way: the Share button was disabled while busy, which dropped focus,
    // and the next step is another person (or fixing the email).
    emailRef.current?.focus()
  }

  async function remove(share: Share) {
    if (await run(() => api.deleteShare(share.id))) setRemoved(share)
  }

  // Re-grants the share exactly as it was (same person, access, mode and scope).
  async function undoRemove() {
    if (!removed) return
    if (await run(() => api.putShare(removed.email, removed.permission, removed.mode, removed.checklistId))) setRemoved(null)
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
              <div className="share-access">
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
              </div>
              <button type="button" className="ghost" disabled={busy} onClick={() => remove(s)} aria-label={`Stop sharing with ${s.email}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {removed && (
        <p className="share-undo" role="status">
          <span>Stopped sharing with {personName(removed)}.</span>
          <button type="button" className="link" disabled={busy} onClick={undoRemove}>
            Undo
          </button>
        </p>
      )}

      {inherited.length > 0 && (
        <div className="share-inherited">
          <div className="share-inherited-header">
            <p className="muted share-empty">Also has access through “Share all lists”</p>
            {onManageAll && (
              <button type="button" className="link" onClick={onManageAll}>
                Manage in Settings
              </button>
            )}
          </div>
          <ul className="share-list">
            {inherited.map((s) => (
              <li key={s.id} className="share-row share-row-inherited">
                <Avatar person={s} className="sm" />
                <span className="share-email" title={s.email}>{s.name ? `${s.name} (${s.email})` : s.email}</span>
                <span className="muted share-access-text">{ACCESS_LABEL[s.permission]} · {MODE_LABEL[s.mode]}</span>
                <span className="share-badge">All lists</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={add} className="share-form">
        <input
          ref={emailRef}
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
