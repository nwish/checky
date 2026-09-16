import { useState } from 'react'
import { api } from './api'

export default function LoginPage({ onAuthed }: { onAuthed: () => void }) {
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
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
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
