import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Me } from './api'
import { applyTheme, getStoredTheme, THEMES, type ThemeId } from './theme'

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.6 3.2 7.9 8 9 4.8-1.1 8-4.4 8-9V6l-8-3Z" />
      <path d="m9.5 12 1.8 1.8L15 10" />
    </svg>
  ),
  signOut: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

type NavItem = { key: string; label: string; path: string; icon: ReactNode }

export default function AppShell({
  user,
  path,
  navigate,
  onSignOut,
  title,
  subtitle,
  children
}: {
  user: Me
  path: string
  navigate: (to: string) => void
  onSignOut: () => void
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const initials = user.email.slice(0, 2).toUpperCase()
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', path: '/', icon: icons.dashboard },
    ...(user.role === 'admin' ? [{ key: 'admin', label: 'Admin', path: '/admin', icon: icons.admin }] : [])
  ]

  function go(to: string) {
    navigate(to)
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <div className="app-nav-bg" aria-hidden="true" />
      <div className="app-nav-top">
        <div className="nav-top-row">
          <div className="nav-brand">
            <img src="/checky.svg" alt="" />
            <div className="brand-text">
              <strong>Checky</strong>
              <span>Checklist workspace</span>
            </div>
          </div>
          <button
            type="button"
            className="nav-hamburger"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? icons.close : icons.menu}
          </button>
        </div>

        <div className={`nav-links${menuOpen ? ' open' : ''}`}>
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-link${path === item.path ? ' active' : ''}`}
              onClick={() => go(item.path)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <main className="app-main">
        <div className="app-topbar">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </main>

      <div className="app-nav-foot">
        <ThemePicker />

        <div className="nav-user">
          <div className="nav-avatar">{initials}</div>
          <div className="nav-user-info">
            <div className="email">{user.email}</div>
            <span className={user.role === 'admin' ? 'badge badge-admin' : 'badge'}>{user.role}</span>
          </div>
          <button type="button" className="nav-signout" onClick={onSignOut} title="Sign out" aria-label="Sign out">
            {icons.signOut}
          </button>
        </div>
      </div>
    </div>
  )
}

function ThemePicker() {
  const [active, setActive] = useState<ThemeId>(() => getStoredTheme())

  function select(id: ThemeId) {
    applyTheme(id)
    setActive(id)
  }

  return (
    <div className="theme-picker" role="radiogroup" aria-label="Accent color">
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          role="radio"
          aria-checked={active === theme.id}
          aria-label={theme.label}
          title={theme.label}
          className={`theme-swatch${active === theme.id ? ' active' : ''}`}
          style={{ '--swatch': theme.action } as CSSProperties}
          onClick={() => select(theme.id)}
        />
      ))}
    </div>
  )
}
