import { useState, type ReactNode } from 'react'
import type { Me } from './api'

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </svg>
  ),
  checklists: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 6 1.5 1.5L8 5" />
      <line x1="11" y1="6" x2="20" y2="6" />
      <path d="m4 12 1.5 1.5L8 11" />
      <line x1="11" y1="12" x2="20" y2="12" />
      <path d="m4 18 1.5 1.5L8 16" />
      <line x1="11" y1="18" x2="20" y2="18" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="20" x2="5" y2="13" />
      <line x1="12" y1="20" x2="12" y2="5" />
      <line x1="19" y1="20" x2="19" y2="10" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.6 3.2 7.9 8 9 4.8-1.1 8-4.4 8-9V6l-8-3Z" />
      <path d="m9.5 12 1.8 1.8L15 10" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
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
  title,
  subtitle,
  children
}: {
  user: Me
  path: string
  navigate: (to: string) => void
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const initials = user.email.slice(0, 2).toUpperCase()
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', path: '/', icon: icons.dashboard },
    { key: 'checklists', label: 'Checklists', path: '/checklists', icon: icons.checklists },
    { key: 'history', label: 'History', path: '/history', icon: icons.history },
    { key: 'settings', label: 'Settings', path: '/settings', icon: icons.settings },
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
            <img src="/rerun.svg" alt="" />
            <div className="brand-text">
              <strong>Rerun</strong>
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
        <button
          type="button"
          className={`nav-link nav-user${path === '/settings' ? ' active' : ''}`}
          onClick={() => go('/settings')}
          title="Settings"
          aria-label={`Settings — signed in as ${user.email}`}
        >
          <span className="nav-avatar">{initials}</span>
          <span className="email">{user.email}</span>
        </button>
      </div>
    </div>
  )
}
