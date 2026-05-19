/**
 * Accent palettes that override the highlight color (--primary, --accent,
 * --accent-foreground, --ring). Background, card, foreground and the status
 * colors stay constant across palettes so legibility doesn't depend on the
 * user's choice. Each palette has a light and dark variant so the accent can
 * be tuned for legibility against each mode's background.
 *
 * Values are HSL channels matching the existing globals.css format (no
 * `hsl()` wrapper — Tailwind's `bg-primary` etc. inject the wrapper).
 *
 * Free users get only `default`; non-default palettes are Pro-gated both
 * client-side (Crown icon + paywall) and server-side (check_profile_theme
 * trigger in schema.sql).
 */
export interface PaletteTokens {
  primary: string
  primaryForeground: string
  accent: string
  accentForeground: string
  ring: string
}

export interface ThemePalette {
  id: string
  /** i18n key suffix: settings.theme.palettes[id] */
  i18nKey: string
  /** Swatch shown in the picker. Light value works for both modes. */
  swatch: string
  /** Whether this palette is free or Pro. */
  free: boolean
  light: PaletteTokens
  dark:  PaletteTokens
}

export const THEMES: readonly ThemePalette[] = [
  {
    id:      'default',
    i18nKey: 'default',
    swatch:  '#7c5cfa',
    free:    true,
    light: {
      primary:           '252 87% 60%',
      primaryForeground: '0 0% 100%',
      accent:            '252 87% 96%',
      accentForeground:  '252 87% 40%',
      ring:              '252 87% 60%',
    },
    dark: {
      primary:           '252 87% 65%',
      primaryForeground: '0 0% 100%',
      accent:            '252 40% 20%',
      accentForeground:  '252 87% 75%',
      ring:              '252 87% 65%',
    },
  },
  {
    id:      'ocean',
    i18nKey: 'ocean',
    swatch:  '#0ea5e9',
    free:    false,
    light: {
      primary:           '199 89% 48%',
      primaryForeground: '0 0% 100%',
      accent:            '199 89% 95%',
      accentForeground:  '199 89% 30%',
      ring:              '199 89% 48%',
    },
    dark: {
      primary:           '199 89% 60%',
      primaryForeground: '0 0% 100%',
      accent:            '199 50% 20%',
      accentForeground:  '199 89% 75%',
      ring:              '199 89% 60%',
    },
  },
  {
    id:      'sunset',
    i18nKey: 'sunset',
    swatch:  '#f97316',
    free:    false,
    light: {
      primary:           '20 90% 52%',
      primaryForeground: '0 0% 100%',
      accent:            '20 90% 95%',
      accentForeground:  '20 90% 32%',
      ring:              '20 90% 52%',
    },
    dark: {
      primary:           '20 90% 62%',
      primaryForeground: '0 0% 100%',
      accent:            '20 50% 22%',
      accentForeground:  '20 90% 75%',
      ring:              '20 90% 62%',
    },
  },
  {
    id:      'forest',
    i18nKey: 'forest',
    swatch:  '#16a34a',
    free:    false,
    light: {
      primary:           '142 71% 38%',
      primaryForeground: '0 0% 100%',
      accent:            '142 71% 94%',
      accentForeground:  '142 71% 22%',
      ring:              '142 71% 38%',
    },
    dark: {
      primary:           '142 60% 50%',
      primaryForeground: '0 0% 100%',
      accent:            '142 40% 18%',
      accentForeground:  '142 60% 70%',
      ring:              '142 60% 50%',
    },
  },
  {
    id:      'lavender',
    i18nKey: 'lavender',
    swatch:  '#c084fc',
    free:    false,
    light: {
      primary:           '280 70% 58%',
      primaryForeground: '0 0% 100%',
      accent:            '280 70% 96%',
      accentForeground:  '280 70% 36%',
      ring:              '280 70% 58%',
    },
    dark: {
      primary:           '280 70% 68%',
      primaryForeground: '0 0% 100%',
      accent:            '280 40% 22%',
      accentForeground:  '280 70% 80%',
      ring:              '280 70% 68%',
    },
  },
  {
    id:      'rose',
    i18nKey: 'rose',
    swatch:  '#e11d48',
    free:    false,
    light: {
      primary:           '340 82% 50%',
      primaryForeground: '0 0% 100%',
      accent:            '340 82% 96%',
      accentForeground:  '340 82% 32%',
      ring:              '340 82% 50%',
    },
    dark: {
      primary:           '340 82% 62%',
      primaryForeground: '0 0% 100%',
      accent:            '340 50% 22%',
      accentForeground:  '340 82% 75%',
      ring:              '340 82% 62%',
    },
  },
] as const

export const FREE_THEME_IDS = THEMES.filter(t => t.free).map(t => t.id)
export const DEFAULT_THEME_ID = 'default'

export function getTheme(id: string | null | undefined): ThemePalette {
  return THEMES.find(t => t.id === id) ?? THEMES[0]
}

export function isProTheme(id: string): boolean {
  const t = THEMES.find(t => t.id === id)
  return !!t && !t.free
}

/**
 * Inline-style mutates the <html> element so the palette overrides take
 * effect immediately. Called by ThemeProvider on every (mode, palette)
 * change. Setting to the default palette restores the values declared in
 * globals.css by removing the inline overrides (clearProperty), so we don't
 * accidentally pin them.
 */
export function applyPaletteToDocument(paletteId: string, mode: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const palette = getTheme(paletteId)
  const tokens = mode === 'dark' ? palette.dark : palette.light

  if (palette.id === DEFAULT_THEME_ID) {
    // Let globals.css handle it — clear any prior overrides.
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-foreground')
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-foreground')
    root.style.removeProperty('--ring')
    return
  }

  root.style.setProperty('--primary',            tokens.primary)
  root.style.setProperty('--primary-foreground', tokens.primaryForeground)
  root.style.setProperty('--accent',             tokens.accent)
  root.style.setProperty('--accent-foreground',  tokens.accentForeground)
  root.style.setProperty('--ring',               tokens.ring)
}
