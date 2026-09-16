import { useState } from 'react'
import { api, type AdminUser, type Me } from './api'
import LoginPage from './LoginPage'
import AdminPage from './AdminPage'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') ?? ''

export default function App() {
  const [state, setState] = useState<{ user: Me | null; loading: boolean }>({ user: null, loading: true })

  useEffect(() => {
    (async () => {
      try {
        await api.me()
        setState({ user: await api.me(), loading: false })
      } catch {
        setState({ user: null, loading: false })
      }
    })()
  }, [])

  const tokenValue = tokenFromUrl()
  if (tokenValue) return <ActivationCard token={tokenValue} />

  const isAdminDirect = window.location.pathname === '/admin' && state.user?.role === 'admin'
  if (isAdminDirect) {
    setState({ user: state.user, loading: false })
    return <AdminPage />
  }

  if (!state.user) return <LoginPage />

  return <AuthCard onAuthed={() => setState({ user: state.user, loading: false })} />
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
        <h2>{done ? 'Account active' : 'Activate account'}</h2>
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
    <main className="center">
      <div className="card">
        <h2>{mode === 'login' ? 'Sign in' : 'Create the first account'}</h2>
        {mode === 'register' && (
          <p className="muted">The first account registered here becomes the admin. After that, registration closes and new users come by invitation.</p>
        )}
        <form onSubmit={submit} className="form">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /> </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? 'One sec…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>
          {mode === 'login' ? 'No account yet? Create the first one' : 'Already have one? Sign in'}
        </button>
      </div>
    </main>
  )
}
