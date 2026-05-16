'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Locale } from './types'
import { DEFAULT_LOCALE, LOCALES } from './types'
import { getMessage, interpolate } from './messages'

const STORAGE_KEY = 'dayflow:locale'

function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const candidates = [
    navigator.language,
    ...(navigator.languages ?? []),
  ].filter(Boolean) as string[]
  for (const lang of candidates) {
    const lower = lang.toLowerCase()
    if (lower.startsWith('en')) return 'en'
    if (lower.startsWith('es')) return 'es'
  }
  return DEFAULT_LOCALE
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    let initial: Locale = DEFAULT_LOCALE
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Locale | null
      initial = saved && LOCALES.includes(saved) ? saved : detectLocale()
    } catch {
      initial = detectLocale()
    }
    setLocaleState(initial)
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (next) => {
      setLocaleState(next)
      try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
    },
    t: (key, vars) => {
      const msg = getMessage(locale, key) ?? getMessage(DEFAULT_LOCALE, key) ?? key
      return interpolate(msg, vars)
    },
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

export function useT() {
  return useContext(I18nContext).t
}

export function useLocale() {
  return useContext(I18nContext).locale
}
