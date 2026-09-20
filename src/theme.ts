export type ThemeId = 'orange' | 'blue' | 'green' | 'purple' | 'yellow' | 'gray'

export type Theme = {
  id: ThemeId
  label: string
  action: string
  actionHover: string
  actionInk: string
}

// The one accent color used for primary actions and the active nav key.
// Each entry keeps ≥4.5:1 contrast between action/actionInk and ≥3:1 for the
// action color against the app's dark surfaces (chassis/panel/key-hover).
export const THEMES: Theme[] = [
  { id: 'orange', label: 'Orange', action: '#ff5a1f', actionHover: '#ff7642', actionInk: '#1c0d04' },
  { id: 'blue', label: 'Blue', action: '#4a92ff', actionHover: '#74acff', actionInk: '#071224' },
  { id: 'green', label: 'Green', action: '#2fd66a', actionHover: '#57e08a', actionInk: '#04170c' },
  { id: 'purple', label: 'Purple', action: '#bd7cf9', actionHover: '#d1a0fb', actionInk: '#1c0a24' },
  { id: 'yellow', label: 'Yellow', action: '#ffd60a', actionHover: '#ffe14d', actionInk: '#221a02' },
  { id: 'gray', label: 'Gray', action: '#aab0b8', actionHover: '#c2c7ce', actionInk: '#15171a' }
]

export const DEFAULT_THEME: ThemeId = 'orange'
const STORAGE_KEY = 'checky-theme'

export function getStoredTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId
  } catch {
    // localStorage unavailable (private mode, etc.) - fall through to default
  }
  return DEFAULT_THEME
}

export function applyTheme(id: ThemeId) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0]
  const root = document.documentElement.style
  root.setProperty('--action', theme.action)
  root.setProperty('--action-hover', theme.actionHover)
  root.setProperty('--action-ink', theme.actionInk)
  try {
    window.localStorage.setItem(STORAGE_KEY, theme.id)
  } catch {
    // best-effort persistence only
  }
}
