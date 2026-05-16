import { getMessage, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

/**
 * Maps a Supabase auth error message (always in English) to the localized
 * equivalent. Falls back to the original message if no match is found.
 */
export function translateAuthError(message: string, locale: Locale = DEFAULT_LOCALE): string {
  const m = message.toLowerCase()
  const t = (key: string) => getMessage(locale, key) ?? getMessage(DEFAULT_LOCALE, key) ?? message

  // ── Credentials ───────────────────────────────────────────────────────────
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return t('auth.errors.invalidCredentials')

  if (m.includes('email not confirmed'))
    return t('auth.errors.emailNotConfirmed')

  // ── Registration ──────────────────────────────────────────────────────────
  if (m.includes('user already registered') || m.includes('email already in use') || m.includes('already registered'))
    return t('auth.errors.alreadyRegistered')

  if (m.includes('signup requires a valid password') || m.includes('password is required'))
    return t('auth.errors.passwordRequired')

  if (m.includes('password should be at least'))
    return t('auth.errors.passwordTooShort')

  if (m.includes('weak_password') || m.includes('password is too weak') || m.includes('should be stronger'))
    return t('auth.errors.passwordWeak')

  if (m.includes('same_password') || m.includes('new password should be different'))
    return t('auth.errors.passwordSame')

  // ── Email / token ─────────────────────────────────────────────────────────
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('email_address_invalid'))
    return t('auth.errors.emailInvalid')

  if (m.includes('token has expired') || m.includes('otp expired') || m.includes('otp_expired'))
    return t('auth.errors.tokenExpired')

  if (m.includes('token is invalid') || m.includes('invalid token'))
    return t('auth.errors.tokenInvalid')

  if (m.includes('email link is invalid or has expired'))
    return t('auth.errors.confirmLinkInvalid')

  // ── Rate limits ───────────────────────────────────────────────────────────
  if (m.includes('email rate limit exceeded') || m.includes('over_email_send_rate_limit'))
    return t('auth.errors.emailRateLimit')

  if (m.includes('for security purposes, you can only request this after') || m.includes('over_request_rate_limit'))
    return t('auth.errors.requestRateLimit')

  if (m.includes('too many requests'))
    return t('auth.errors.tooManyRequests')

  // ── Session ───────────────────────────────────────────────────────────────
  if (m.includes('auth session missing') || m.includes('no session'))
    return t('auth.errors.sessionMissing')

  if (m.includes('session expired') || m.includes('jwt expired'))
    return t('auth.errors.sessionExpired')

  if (m.includes('user not found'))
    return t('auth.errors.userNotFound')

  if (m.includes('signup_disabled') || m.includes('signups not allowed'))
    return t('auth.errors.signupDisabled')

  // Fallback — return as-is so nothing is silently swallowed
  return message
}
