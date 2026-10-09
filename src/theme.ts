export type ThemeId = 'orange' | 'blue' | 'green' | 'purple' | 'yellow' | 'gray'
export type ThemeMode = 'auto' | 'light' | 'dark'

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
export const DEFAULT_THEME_MODE: ThemeMode = 'auto'
const STORAGE_KEY = 'rerun-theme'
const MODE_STORAGE_KEY = 'rerun-theme-mode'

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

export function getStoredThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY)
    if (stored === 'auto' || stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (private mode, etc.) - fall through to default
  }
  return DEFAULT_THEME_MODE
}

function resolvedThemeMode(mode: ThemeMode): Exclude<ThemeMode, 'auto'> {
  if (mode !== 'auto') return mode
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyThemeMode(mode: ThemeMode) {
  const resolved = resolvedThemeMode(mode)
  const root = document.documentElement
  root.dataset.themeMode = resolved
  root.style.colorScheme = resolved
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // best-effort persistence only
  }
}

/** Reapply the automatic preference when the operating system changes modes. */
export function watchSystemTheme() {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!media) return () => {}

  const update = () => {
    if (getStoredThemeMode() === 'auto') applyThemeMode('auto')
  }
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}
