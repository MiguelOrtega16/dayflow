export type Locale = 'en' | 'es'

export const LOCALES: readonly Locale[] = ['en', 'es']
export const DEFAULT_LOCALE: Locale = 'es'

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
}
