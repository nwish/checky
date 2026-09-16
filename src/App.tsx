import { useEffect, useState } from 'react'
import { api, type Me } from './api'
import LoginPage from './LoginPage'
import AdminPage from './AdminPage'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') ?? ''

export default function App() {
  const [state, setState] = useState<{ user: Me | null; loading: boolean }>({ user: null, loading: true })

  const load = () => {
    api
      .me()
      .then((user) => setState({ user, loading: false }))
      .catch(() => setState({ user: null, loading: false }))
  }

  useEffect(() => {
    load()
  }, [])

  const tokenValue = tokenFromUrl()
  if (tokenValue) return <ActivationCard token={tokenValue} />

  if (state.loading) return <main className="center"><div className="card"><p>Loading…</p></div></main>

  const isAdminDirect = window.location.pathname === '/admin' && state.user?.role === 'admin'
  if (isAdminDirect) return <AdminPage />

  if (state.user) return <Shell user={state.user} onSignOut={load} />

  return <LoginPage onAuthed={load} />
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
      window.location.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="center">
      <div className="card">
        <h2>Activate account</h2>
        <form onSubmit={submit} className="form">
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || password.length < 8}>{busy ? 'Activating…' : 'Activate account'}</button>
        </form>
      </div>
    </main>
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
        <div className="brand-row">
          <img src="/checky.svg" width="30" height="30" alt="" />
          <div>
            <h1>Checky</h1>
            <p className="muted">Foundation ready — the checklist app lands next</p>
          </div>
        </div>
        <div className="who">
          <span>
            {user.email} <span className={user.role === 'admin' ? 'badge badge-admin' : 'badge'}>{user.role}</span>
          </span>
          <button className="ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {user.role === 'admin' ? (
        <p className="muted">
          Admin tools live at <a href="/admin">/admin</a>.
        </p>
      ) : (
        <p className="muted">Signed in. Your checklist workspace lands here next.</p>
      )}
    </div>
  )
}
