import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, applyThemeMode, getStoredTheme, getStoredThemeMode, watchSystemTheme } from './theme'
import './index.css'

applyTheme(getStoredTheme())
applyThemeMode(getStoredThemeMode())
watchSystemTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
