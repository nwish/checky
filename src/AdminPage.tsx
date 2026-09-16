import { useState, useEffect } from 'react'
import { api, type AdminUser } from './api'

export default function AdminPage() {
  const [email, setEmail] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState<AdminUser[] | null>(null)

  useEffect(() => {
    api.users().then((r) => setUsers(r.users)).catch(() => setUsers([]))
  }, [])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setFeedback(null)
    try {
      const r = await api.invite(email)
      setFeedback(r.mail === 'sent' ? `Invited ${r.email}${r.resent ? ' (resent)' : ''}` : `User ${r.email} created — email was logged to the server (SMTP_HOST not set)`)
      setEmail('')
      const all = await api.users()
      setUsers(all.users)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const members = (users ?? []).filter((u) => u.activated)
  const pending = (users ?? []).filter((u) => !u.activated)

  return (
    <div className="admin">
      <section className="card">
        <h2>Invite a user</h2>
        <p className="muted">They get an email with a single-use link to set their own password.</p>
        <form onSubmit={invite} className="form">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="teammate@example.com" /></label>
          {error && <p className="error">{error}</p>}
          {feedback && <p className="ok">{feedback}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</button>
        </form>
      </section>
      <section className="card">
        <h2>Users</h2>
        <ul className="user-list">
          {members.map((u) => (
            <li key={u.email} className="user-row">
              <span className="user-email">{u.email}</span>
              <span className={u.role === 'admin' ? 'badge badge-admin' : 'badge'}>{u.role}</span>
              <span className="muted">{u.activated_at ? new Date(u.activated_at).toLocaleDateString() : u.created_at.slice(0, 10)}</span>
            </li>
          ))}
          {pending.map((u) => (
            <li key={u.email} className="user-row">
              <span className="user-email">{u.email}</span>
              <span className="badge badge-pending">Awaiting activation</span>
            </li>
          ))}
          {(members.length + pending.length === 0) && <li className="muted">No users yet</li>}
        </ul>
      </section>
    </div>
  )
}
