import { useCallback, useEffect, useState } from 'react'
import { api, type AdminUser, type Me } from './api'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') ?? ''

export default function App() {
  const [token] = useState(tokenFromUrl)
  const [state, setState] = useState<{ user: Me | null; loading: boolean }>({ user: null, loading: true })

  const load = useCallback(() => {
    api
      .me()
      .then((user) => setState({ user, loading: false }))
      .catch(() => setState({ user: null, loading: false }))
  }, [])

  useEffect(() => {
    if (!token) load()
    else setState({ user: null, loading: false })
  }, [token, load])

  if (token) return <ActivationCard token={token} />
  if (state.loading) return <div className="card"><p>loading…</p></div>
  if (state.user) return <Shell user={state.user} onSignOut={load} />
  return <AuthCard onAuthed={load} />
}

function ActivationCard({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.activate(token, password)
      setDone(true)
      window.history.replaceState(null, '', '/')
      window.location.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) return <div className="card"><h2>account active</h2><p>you're all set — loading the app…</p></div>

  return (
    <div className="card">
      <h2>set your password</h2>
      <p className="muted">you've been invited to Checky. Pick a password to activate this account.</p>
      <form onSubmit={submit} className="form">
        <label>
          password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || password.length < 8}>{busy ? 'activating…' : 'activate account'}</button>
      </form>
    </div>
  )
}

function Shell({ user, onSignOut }: { user: Me; onSignOut: () => void }) {
  async function signOut() {
    await api.logout().catch(() => {})
    onSignOut()
  }

  return (
    <div className="shell">
      <header>
        <div>
          <h1>Checky</h1>
          <p className="muted">foundation ready — the checklist app lands next</p>
        </div>
        <div className="who">
          <span>
            {user.email} <span className={user.role === 'admin' ? 'badge badge-admin' : 'badge'}>{user.role}</span>
          </span>
          <button className="ghost" onClick={signOut}>sign out</button>
        </div>
      </header>
      {user.role === 'admin' ? <AdminPanel /> : <p className="muted">signed in as a regular user.</p>}
    </div>
  )
}

function AdminPanel() {
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
      setFeedback(r.mail === 'sent' ? `invited ${r.email}${r.resent ? ' (resent)' : ''}` : `user ${r.email} created — email was logged to the server (SMTP_HOST not set)`)
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
        <h2>invite a user</h2>
        <p className="muted">they get an email with a single-use link to set their own password.</p>
        <form onSubmit={invite} className="form">
          <label>
            email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="teammate@example.com" />
          </label>
          {error && <p className="error">{error}</p>}
          {feedback && <p className="ok">{feedback}</p>}
          <button type="submit" disabled={busy}>{busy ? 'inviting…' : 'send invite'}</button>
        </form>
      </section>
      <section className="card">
        <h2>users</h2>
        <ul className="user-list">
          {members.map((u) => (
            <li key={u.email} className="user-row">
              <span className="user-email">{u.email}</span>
              <span className={u.role === 'admin' ? 'badge badge-admin' : 'badge'}>{u.role}</span>
              <span className="muted">since {u.activated_at ? new Date(u.activated_at).toLocaleDateString() : u.created_at.slice(0, 10)}</span>
            </li>
          ))}
          {pending.map((u) => (
            <li key={u.email} className="user-row">
              <span className="user-email">{u.email}</span>
              <span className="badge badge-pending">awaiting activation</span>
              <span className="muted">invited {u.invited_at ? new Date(u.invited_at).toLocaleDateString() : u.created_at.slice(0, 10)}</span>
            </li>
          ))}
          {members.length + pending.length === 0 && <li className="muted">no users yet</li>}
        </ul>
      </section>
    </div>
  )
}

function AuthCard({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await api.login(email, password)
      else await api.register(email, password)
      onAuthed()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>{mode === 'login' ? 'sign in' : 'create the first account'}</h2>
      {mode === 'register' && (
        <p className="muted">the first account registered here becomes the admin. after that, registration closes and new users come by invitation.</p>
      )}
      <form onSubmit={submit} className="form">
        <label>
          email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'one sec…' : mode === 'login' ? 'sign in' : 'create account'}</button>
      </form>
      <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>
        {mode === 'login' ? 'no account yet? create the first one' : 'already have one? sign in'}
      </button>
    </div>
  )
}
