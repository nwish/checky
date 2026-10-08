import { useEffect, useState } from 'react'
import { api, type AdminUser } from './api'
import Avatar, { personName } from './Avatar'

export default function AdminPage() {
  const [email, setEmail] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)
  const [settingError, setSettingError] = useState<string | null>(null)

  useEffect(() => {
    api.users().then((r) => setUsers(r.users)).catch(() => setUsers([]))
    api.adminSettings().then((s) => setRegistrationOpen(s.registrationOpen)).catch(() => setSettingError('Could not load settings'))
  }, [])

  async function refresh() {
    const r = await api.users()
    setUsers(r.users)
  }

  async function toggleRegistration() {
    if (registrationOpen === null) return
    setSettingError(null)
    try {
      const s = await api.setRegistrationOpen(!registrationOpen)
      setRegistrationOpen(s.registrationOpen)
    } catch (err) {
      setSettingError((err as Error).message)
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setFeedback(null)
    try {
      const r = await api.invite(email)
      setFeedback(r.mail === 'sent' ? `Invited ${r.email}${r.resent ? ' (resent)' : ''}` : `User ${r.email} created — email was logged to the server (SMTP_HOST not set)`)
      setEmail('')
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function resend(target: string) {
    setResending(target)
    setError(null)
    setFeedback(null)
    try {
      const r = await api.invite(target)
      setFeedback(`Invite resent to ${r.email}`)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setResending(null)
    }
  }

  const members = (users ?? []).filter((u) => u.activated)
  const pending = (users ?? []).filter((u) => !u.activated)

  return (
    <>
      <div className="status-readout">
        <div className="segment">
          <span className="value">{users?.length ?? '\u2014'}</span>
          <span className="label">Total users</span>
        </div>
        <div className="segment">
          <span className="value">{members.length}</span>
          <span className="label">Active</span>
        </div>
        <div className="segment">
          <span className="value">{pending.length}</span>
          <span className="label">Pending invites</span>
        </div>
      </div>

      <div className="panel-grid">
        <div className="admin-side">
          <section className="card">
            <h2>Invite a user</h2>
            <p className="muted">They get an email with a single-use link to set their own password.</p>
            <form onSubmit={invite} className="form">
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="teammate@example.com" />
              </label>
              {error && <p className="error">{error}</p>}
              {feedback && <p className="ok">{feedback}</p>}
              <button type="submit" disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</button>
            </form>
          </section>

          <section className="card">
            <h2>Registration</h2>
            <p className="muted">
              {registrationOpen
                ? 'Open: anyone who can reach this page can create an account without an invitation. New accounts get the user role.'
                : 'Closed: new people join only by invitation.'}
            </p>
            {settingError && <p className="error">{settingError}</p>}
            <button type="button" className="ghost" onClick={toggleRegistration} disabled={registrationOpen === null}>
              {registrationOpen ? 'Close registration' : 'Open registration'}
            </button>
          </section>
        </div>

        <section className="card">
          <h2>Users</h2>
          {users === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="user-list">
              {members.map((u) => (
                <li key={u.email} className="user-row">
                  <Avatar person={u} />
                  <div className="user-meta">
                    <span className="user-email">{personName(u)}</span>
                    <span className="muted">
                      {u.name ? `${u.email} · ` : ''}Joined {u.activated_at ? new Date(u.activated_at).toLocaleDateString() : u.created_at.slice(0, 10)}
                    </span>
                  </div>
                  <span className={u.role === 'admin' ? 'badge badge-admin' : 'badge'}>{u.role}</span>
                </li>
              ))}
              {pending.map((u) => (
                <li key={u.email} className="user-row">
                  <Avatar person={u} className="pending" />
                  <div className="user-meta">
                    <span className="user-email">{u.email}</span>
                    <span className="muted">Invited {u.invited_at ? new Date(u.invited_at).toLocaleDateString() : u.created_at.slice(0, 10)}</span>
                  </div>
                  <span className="badge badge-pending">Pending</span>
                  <button type="button" className="ghost" onClick={() => resend(u.email)} disabled={resending === u.email}>
                    {resending === u.email ? 'Resending…' : 'Resend'}
                  </button>
                </li>
              ))}
              {members.length + pending.length === 0 && <li className="muted">No users yet</li>}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
