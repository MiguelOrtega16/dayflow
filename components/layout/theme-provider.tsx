'use client'

import * as React from 'react'
import { applyPaletteToDocument, DEFAULT_THEME_ID, THEMES, isProTheme } from '@/lib/themes'
import { createClient } from '@/lib/supabase/client'
import { computeEntitlement } from '@/lib/billing/entitlement'
import type { Subscription } from '@/types'

type Theme = 'dark' | 'light' | 'system'

// localStorage key for the per-user palette cache. Stored as JSON
// `{ userId, palette, isPro }` so we can apply optimistically on mount and
// only invalidate when the cached userId differs from the current session.
// isPro is cached too so a downgraded user who picked a Pro palette
// previously doesn't get a flash of the Pro accent before the
// subscriptions query resolves.
const PALETTE_CACHE_KEY = 'dayflow-palette'

interface PaletteCache {
  userId: string
  palette: string
  isPro: boolean
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
      return { ...parsed, isPro: typeof parsed.isPro === 'boolean' ? parsed.isPro : false }
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
  // Pro entitlement — drives the "soft revert" for non-default palettes.
  // When false, isProTheme(palette) is forced back to DEFAULT at apply
  // time. Sourced from the subscriptions table; updates in real time via
  // the auth + subs effect below.
  const [isPro, setIsPro]          = React.useState<boolean>(false)

  // Hydrate mode + palette from localStorage instantly so returning users
  // don't see a flash. The palette hydration is OPTIMISTIC — we don't yet
  // know whose session this is, so the cached userId may belong to a
  // previous user on this browser. The auth-state effect below corrects
  // mismatches by refetching from the DB.
  React.useEffect(() => {
    const storedTheme = localStorage.getItem('dayflow-theme') as Theme | null
    if (storedTheme) setThemeState(storedTheme)

    const cached = readPaletteCache()
    if (cached) {
      setPaletteState(cached.palette)
      setIsPro(cached.isPro)
    }
  }, [])

  // Authoritative palette source = the signed-in user's preferences.theme.
  // Listening to Supabase auth-state keeps the in-memory palette in sync
  // with whichever account is active, so switching accounts on the same
  // browser doesn't carry the previous user's accent into the new session.
  // We only react to INITIAL_SESSION / SIGNED_IN / SIGNED_OUT — TOKEN_REFRESHED
  // fires periodically with the same user and would cause needless DB hits.
  // The same effect also tracks Pro entitlement (subscriptions table +
  // realtime channel) so an in-session upgrade or downgrade flips the
  // soft-revert gate without requiring a page reload.
  React.useEffect(() => {
    const supabase = createClient()
    let subsChannel: ReturnType<typeof supabase.channel> | null = null

    const loadEntitlement = async (userId: string) => {
      try {
        const { data } = await supabase.from('subscriptions').select('*').eq('user_id', userId)
        const ent = computeEntitlement((data ?? []) as Subscription[])
        setIsPro(ent.isPro)
        // Refresh the cached isPro so the next mount hydrates correctly
        // and we don't flash a Pro accent at a downgraded user.
        const cached = readPaletteCache()
        if (cached && cached.userId === userId) {
          writePaletteCache({ ...cached, isPro: ent.isPro })
        }
      } catch {
        setIsPro(false)
      }
    }

    const subscribeToEntitlement = (userId: string) => {
      subsChannel = supabase
        .channel(`theme-provider-subs:${userId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
          () => loadEntitlement(userId))
        .subscribe()
    }

    const teardownEntitlementChannel = () => {
      if (subsChannel) { supabase.removeChannel(subsChannel); subsChannel = null }
    }

    const applyFromUser = async (userId: string | null) => {
      teardownEntitlementChannel()
      if (!userId) {
        clearPaletteCache()
        setPaletteState(DEFAULT_THEME_ID)
        setIsPro(false)
        return
      }
      // Always start an entitlement subscription for the new session so
      // upgrades/downgrades that happen later (e.g. RevenueCat webhook)
      // propagate to the UI without a reload.
      loadEntitlement(userId)
      subscribeToEntitlement(userId)

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
        writePaletteCache({ userId, palette: id, isPro })
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

    return () => {
      subscription.unsubscribe()
      teardownEntitlementChannel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resolve mode → isDark, apply both the .dark class AND the palette CSS
  // vars. Re-runs on system color-scheme change too when mode = 'system'.
  // Soft-revert: a downgraded user keeps their Pro palette stored in the
  // DB (so re-subscribing restores it automatically), but the renderer
  // falls back to DEFAULT_THEME_ID at apply time when isPro is false.
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

      const effectivePalette = !isPro && isProTheme(palette) ? DEFAULT_THEME_ID : palette
      applyPaletteToDocument(effectivePalette, isDark ? 'dark' : 'light')
    }

    apply()

    if (theme === 'system' && enableSystem) {
      mediaQuery.addEventListener('change', apply)
      return () => mediaQuery.removeEventListener('change', apply)
    }
  }, [theme, palette, isPro, attribute, disableTransitionOnChange, enableSystem])

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
      if (user) writePaletteCache({ userId: user.id, palette: paletteId, isPro })
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
