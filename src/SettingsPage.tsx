import { useEffect, useState, type CSSProperties } from 'react'
import { api, type Me } from './api'
import Avatar from './Avatar'
import IconPicker from './IconPicker'
import { applyTheme, getStoredTheme, THEMES, type ThemeId } from './theme'

const NAME_MAX = 60

const signOutIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
)

export default function SettingsPage({ user, onSignOut, onProfileChange }: { user: Me; onSignOut: () => void; onProfileChange: (me: Me) => void }) {
  const [theme, setTheme] = useState<ThemeId>(() => getStoredTheme())
  const [nameDraft, setNameDraft] = useState(user.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setNameDraft(user.name ?? '')
  }, [user.name])

  function selectTheme(id: ThemeId) {
    applyTheme(id)
    setTheme(id)
  }

  async function saveProfile(patch: { name?: string | null; avatar?: string | null }) {
    setError(null)
    setSaved(false)
    try {
      onProfileChange(await api.updateProfile(patch))
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function saveName() {
    const name = nameDraft.replace(/\s+/g, ' ').trim()
    if (name === (user.name ?? '')) {
      setNameDraft(user.name ?? '')
      return
    }
    saveProfile({ name: name || null })
  }

  return (
    <div className="settings">
      <section className="card">
        <h2>Profile</h2>
        <p className="muted">How you appear to people you share lists with. Without a name, they see your email.</p>
        <div className="profile-edit">
          <Avatar person={user} className="profile-avatar" />
          <div className="profile-fields">
            <label>
              Display name
              <input
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value)
                  setSaved(false)
                }}
                onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                maxLength={NAME_MAX}
                placeholder={user.email.split('@')[0]}
                autoComplete="name"
              />
            </label>
            <div className="profile-avatar-row">
              <span className="profile-avatar-label">Avatar</span>
              <IconPicker value={user.avatar} onChange={(avatar) => saveProfile({ avatar })} />
              {user.avatar && (
                <button type="button" className="ghost" onClick={() => saveProfile({ avatar: null })}>
                  Use my initials
                </button>
              )}
            </div>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {saved && !error && <p className="ok">Saved</p>}
      </section>

      <section className="card">
        <h2>Account</h2>
        <div className="user-row">
          <Avatar person={user} />
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
