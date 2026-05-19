'use client'

import * as React from 'react'
import { applyPaletteToDocument, DEFAULT_THEME_ID, THEMES } from '@/lib/themes'
import { createClient } from '@/lib/supabase/client'

type Theme = 'dark' | 'light' | 'system'

// localStorage key for the per-user palette cache. Stored as JSON
// `{ userId, palette }` so we can apply optimistically on mount and only
// invalidate when the cached userId differs from the current session.
const PALETTE_CACHE_KEY = 'dayflow-palette'

interface PaletteCache {
  userId: string
  palette: string
}

function readPaletteCache(): PaletteCache | null {
  try {
    const raw = localStorage.getItem(PALETTE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.userId === 'string' &&
      typeof parsed.palette === 'string' &&
      THEMES.some(t => t.id === parsed.palette)
    ) {
      return parsed
    }
  } catch { /* fall through */ }
  return null
}

function writePaletteCache(cache: PaletteCache) {
  try { localStorage.setItem(PALETTE_CACHE_KEY, JSON.stringify(cache)) } catch {}
}

function clearPaletteCache() {
  try { localStorage.removeItem(PALETTE_CACHE_KEY) } catch {}
}

interface ThemeProviderProps {
  children: React.ReactNode
  attribute?: string
  defaultTheme?: Theme
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}

interface ThemeContextValue {
  /** Light / Dark / System mode. */
  theme: Theme
  setTheme: (theme: Theme) => void
  /** Accent palette id from lib/themes.ts. */
  palette: string
  /** Updates the in-memory palette so the UI rewires CSS vars immediately.
   *  Does NOT persist to the DB — callers (settings page) own the
   *  preferences write so they can surface errors (e.g. the Pro-gate
   *  trigger rejection). Cross-device persistence is handled by the
   *  auth-state effect inside ThemeProvider. */
  setPalette: (paletteId: string) => void
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  palette: DEFAULT_THEME_ID,
  setPalette: () => {},
})

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  attribute = 'class',
  enableSystem = true,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState]     = React.useState<Theme>(defaultTheme)
  const [palette, setPaletteState] = React.useState<string>(DEFAULT_THEME_ID)

  // Hydrate mode + palette from localStorage instantly so returning users
  // don't see a flash. The palette hydration is OPTIMISTIC — we don't yet
  // know whose session this is, so the cached userId may belong to a
  // previous user on this browser. The auth-state effect below corrects
  // mismatches by refetching from the DB.
  React.useEffect(() => {
    const storedTheme = localStorage.getItem('dayflow-theme') as Theme | null
    if (storedTheme) setThemeState(storedTheme)

    const cached = readPaletteCache()
    if (cached) setPaletteState(cached.palette)
  }, [])

  // Authoritative palette source = the signed-in user's preferences.theme.
  // Listening to Supabase auth-state keeps the in-memory palette in sync
  // with whichever account is active, so switching accounts on the same
  // browser doesn't carry the previous user's accent into the new session.
  // We only react to INITIAL_SESSION / SIGNED_IN / SIGNED_OUT — TOKEN_REFRESHED
  // fires periodically with the same user and would cause needless DB hits.
  React.useEffect(() => {
    const supabase = createClient()

    const applyFromUser = async (userId: string | null) => {
      if (!userId) {
        clearPaletteCache()
        setPaletteState(DEFAULT_THEME_ID)
        return
      }
      // If the cache already belongs to this user, the mount effect has
      // already applied it — skip the DB query to keep page loads light.
      // Cross-device palette changes propagate on the next sign-in or when
      // the user visits the settings page (which writes the cache fresh).
      const cached = readPaletteCache()
      if (cached && cached.userId === userId) return

      try {
        const { data } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', userId)
          .single()
        const raw = (data?.preferences as { theme?: unknown } | null)?.theme
        const id  = typeof raw === 'string' && THEMES.some(t => t.id === raw) ? raw : DEFAULT_THEME_ID
        writePaletteCache({ userId, palette: id })
        setPaletteState(id)
      } catch {
        // Network failure / missing preferences column — fall back to default
        setPaletteState(DEFAULT_THEME_ID)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        applyFromUser(session?.user?.id ?? null)
      } else if (event === 'SIGNED_OUT') {
        applyFromUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Resolve mode → isDark, apply both the .dark class AND the palette CSS
  // vars. Re-runs on system color-scheme change too when mode = 'system'.
  React.useEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const isDark =
        theme === 'dark' || (theme === 'system' && mediaQuery.matches)

      if (disableTransitionOnChange) {
        root.classList.add('[&_*]:!transition-none')
        setTimeout(() => root.classList.remove('[&_*]:!transition-none'), 0)
      }

      if (attribute === 'class') {
        root.classList.remove('light', 'dark')
        root.classList.add(isDark ? 'dark' : 'light')
      }

      applyPaletteToDocument(palette, isDark ? 'dark' : 'light')
    }

    apply()

    if (theme === 'system' && enableSystem) {
      mediaQuery.addEventListener('change', apply)
      return () => mediaQuery.removeEventListener('change', apply)
    }
  }, [theme, palette, attribute, disableTransitionOnChange, enableSystem])

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem('dayflow-theme', newTheme)
    setThemeState(newTheme)
  }

  const setPalette = (paletteId: string) => {
    if (!THEMES.some(t => t.id === paletteId)) return
    setPaletteState(paletteId)
    // Refresh the cache with the current session user so future page loads
    // hydrate optimistically with this palette. Fire-and-forget; the cache
    // is a perf optimization, not a correctness boundary.
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) writePaletteCache({ userId: user.id, palette: paletteId })
    })()
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return React.useContext(ThemeContext)
}
