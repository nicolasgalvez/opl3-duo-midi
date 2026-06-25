// Theme palettes. Single source of truth for colours (applied as CSS variables
// at runtime); every theme is verified to meet WCAG 2.2 AA in themes.test.ts.

export type ThemeName = 'green' | 'winamp' | 'win98' | 'amber'

export interface ThemeTokens {
  bg: string
  panel: string
  fg: string
  dim: string
  accent: string
  eqLow: string
  eqMid: string
  eqHigh: string
  eqOff: string
  menuBg: string
  menuHover: string
  font: string
}

export interface Theme {
  name: ThemeName
  label: string
  tokens: ThemeTokens
}

const MONO = "'Courier New', ui-monospace, monospace"

export const THEMES: Theme[] = [
  {
    name: 'green',
    label: 'Green CRT',
    tokens: {
      bg: '#06140c',
      panel: '#0a2415',
      fg: '#6dffa0',
      dim: '#46c777',
      accent: '#ffd23f',
      eqLow: '#4af07a',
      eqMid: '#ffcc33',
      eqHigh: '#ff5a5a',
      eqOff: '#0f3d20',
      menuBg: '#0a2415',
      menuHover: '#14502c',
      font: MONO,
    },
  },
  {
    name: 'winamp',
    label: 'Winamp',
    tokens: {
      bg: '#1b1b22',
      panel: '#2b2b38',
      fg: '#d4d8ee',
      dim: '#9aa0c0',
      accent: '#7fd6ff',
      eqLow: '#2e8f4f',
      eqMid: '#d8c742',
      eqHigh: '#d85a5a',
      eqOff: '#15151c',
      menuBg: '#2b2b38',
      menuHover: '#3f3f52',
      font: "'MS Sans Serif', Tahoma, ui-sans-serif, sans-serif",
    },
  },
  {
    name: 'win98',
    label: 'Win98',
    tokens: {
      bg: '#c0c0c0',
      panel: '#d4d0c8',
      fg: '#101010',
      dim: '#454545',
      accent: '#000080',
      eqLow: '#008000',
      eqMid: '#806000',
      eqHigh: '#a00000',
      eqOff: '#9a9a9a',
      menuBg: '#c0c0c0',
      menuHover: '#aeb8d4',
      font: "'MS Sans Serif', Tahoma, ui-sans-serif, sans-serif",
    },
  },
  {
    name: 'amber',
    label: 'Amber CRT',
    tokens: {
      bg: '#1a0f00',
      panel: '#2a1c08',
      fg: '#ffb000',
      dim: '#d08a10',
      accent: '#ffd676',
      eqLow: '#ffa000',
      eqMid: '#ffc040',
      eqHigh: '#ff6020',
      eqOff: '#3a2606',
      menuBg: '#2a1c08',
      menuHover: '#4a3410',
      font: MONO,
    },
  },
]

export const THEME_NAMES = THEMES.map((t) => t.name)

export function themeByName(name: ThemeName): Theme {
  return THEMES.find((t) => t.name === name) ?? THEMES[0]
}

/** Apply a theme's tokens to the document as CSS variables. */
export function applyTheme(name: ThemeName, root: HTMLElement): void {
  const { tokens } = themeByName(name)
  root.dataset.theme = name
  root.style.setProperty('--bg', tokens.bg)
  root.style.setProperty('--panel', tokens.panel)
  root.style.setProperty('--fg', tokens.fg)
  root.style.setProperty('--dim', tokens.dim)
  root.style.setProperty('--accent', tokens.accent)
  root.style.setProperty('--eq-low', tokens.eqLow)
  root.style.setProperty('--eq-mid', tokens.eqMid)
  root.style.setProperty('--eq-high', tokens.eqHigh)
  root.style.setProperty('--eq-off', tokens.eqOff)
  root.style.setProperty('--menu-bg', tokens.menuBg)
  root.style.setProperty('--menu-hover', tokens.menuHover)
  root.style.setProperty('--font', tokens.font)
}
