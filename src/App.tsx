import { useEffect, useState, type FormEvent } from 'react'
import { api, type Me } from './api'

type Mode = 'login' | 'register'

export default function App() {
  const [state, setState] = useState<{ user: Me | null; loading: boolean }>({ user: null, loading: true })

  useEffect(() => {
    api
      .me()
      .then((user) => setState({ user, loading: false }))
      .catch(() => setState({ user: null, loading: false }))
  }, [])

  if (state.loading) {
    return (
      <main className="center">
        <p className="dim">Loading…</p>
      </main>
    )
  }

  return state.user ? <Shell user={state.user} /> : <AuthCard />
}

function Shell({ user }: { user: Me }) {
  return (
    <>
      <header className="topbar">
        <span className="brand">Checky</span>
        <div className="topbar-right">
          <span className="dim">{user.email}</span>
          <button
            onClick={() => {
              api.logout().then(() => window.location.reload())
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="center">
        <div>
          <h1>Welcome</h1>
          <p className="dim">Foundation is up — we build the checklist part next.</p>
        </div>
      </main>
    </>
  )
}

function AuthCard() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const call = mode === 'login' ? api.login(email, password) : api.register(email, password)
    call
      .then(() => window.location.reload())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'something went wrong')
        setBusy(false)
      })
  }

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login')
    setError(null)
  }

  return (
    <main className="center">
      <form className="card" onSubmit={onSubmit}>
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="ghost" onClick={switchMode}>
          {mode === 'login' ? 'No account? Create one' : 'Have an account? Sign in'}
        </button>
      </form>
    </main>
  )
}
