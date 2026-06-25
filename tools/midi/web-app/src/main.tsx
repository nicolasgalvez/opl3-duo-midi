import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme, THEME_NAMES, type ThemeName } from './lib/themes'

// Apply the persisted theme before the first paint to avoid a flash of the
// default palette (App keeps it in sync on change).
try {
  const persisted = JSON.parse(localStorage.getItem('opl-web-ui') || '{}')?.state
  const t = (THEME_NAMES as string[]).includes(persisted?.theme) ? (persisted.theme as ThemeName) : 'green'
  applyTheme(t, document.documentElement)
} catch {
  applyTheme('green', document.documentElement)
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
