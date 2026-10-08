import { useState, type CSSProperties } from 'react'
import type { Me } from './api'
import { applyTheme, getStoredTheme, THEMES, type ThemeId } from './theme'

const signOutIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
)

export default function SettingsPage({ user, onSignOut }: { user: Me; onSignOut: () => void }) {
  const [theme, setTheme] = useState<ThemeId>(() => getStoredTheme())

  function selectTheme(id: ThemeId) {
    applyTheme(id)
    setTheme(id)
  }

  return (
    <div className="settings">
      <section className="card">
        <h2>Account</h2>
        <div className="user-row">
          <div className="user-avatar">{user.email.slice(0, 2).toUpperCase()}</div>
          <div className="user-meta">
            <span className="user-email">{user.email}</span>
          </div>
          <span className={user.role === 'admin' ? 'badge badge-admin' : 'badge'}>{user.role}</span>
        </div>
        <button type="button" className="ghost settings-signout" onClick={onSignOut}>
          {signOutIcon}
          Sign out
        </button>
      </section>

      <section className="card">
        <h2>Appearance</h2>
        <p className="muted">Accent color for buttons and the active page. Saved on this device.</p>
        <div className="theme-picker" role="radiogroup" aria-label="Accent color">
          {THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={theme === option.id}
              aria-label={option.label}
              title={option.label}
              className={`theme-swatch${theme === option.id ? ' active' : ''}`}
              style={{ '--swatch': option.action } as CSSProperties}
              onClick={() => selectTheme(option.id)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
