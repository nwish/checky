import { useEffect, useState } from 'react'
import { api, type Me } from './api'
import LoginPage from './LoginPage'
import AdminPage from './AdminPage'
import DashboardPage from './DashboardPage'
import ChecklistsPage from './ChecklistsPage'
import AppShell from './AppShell'
import { useRoute } from './useRoute'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') ?? ''

export default function App() {
  const [state, setState] = useState<{ user: Me | null; loading: boolean }>({ user: null, loading: true })
  const { path, navigate } = useRoute()

  const load = () => {
    api
      .me()
      .then((user) => setState({ user, loading: false }))
      .catch(() => setState({ user: null, loading: false }))
  }

  const signOut = async () => {
    await api.logout().catch(() => {})
    setState({ user: null, loading: false })
  }

  useEffect(() => {
    load()
  }, [])

  const tokenValue = tokenFromUrl()
  if (tokenValue) return <ActivationCard token={tokenValue} />

  if (state.loading) return <main className="center"><div className="card"><p>Loading…</p></div></main>

  if (!state.user) return <LoginPage onAuthed={load} />

  const isAdminRoute = path === '/admin' && state.user.role === 'admin'
  const isChecklistsRoute = path === '/checklists'
  const activePath = isAdminRoute ? '/admin' : isChecklistsRoute ? '/checklists' : '/'

  const titles: Record<string, { title: string; subtitle: string }> = {
    '/': { title: 'Dashboard', subtitle: `Welcome back, ${state.user.email.split('@')[0]}.` },
    '/checklists': { title: 'Your checklists', subtitle: 'Build and customize the lists you run again and again.' },
    '/admin': { title: 'Admin', subtitle: 'Invite teammates and manage access.' }
  }

  return (
    <AppShell
      user={state.user}
      path={activePath}
      navigate={navigate}
      onSignOut={signOut}
      title={titles[activePath].title}
      subtitle={titles[activePath].subtitle}
    >
      {isAdminRoute ? <AdminPage /> : isChecklistsRoute ? <ChecklistsPage /> : <DashboardPage navigate={navigate} />}
    </AppShell>
  )
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

  if (done) return <main className="center"><div className="card"><h2>Account active</h2><p>You're all set — loading the app…</p></div></main>

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
