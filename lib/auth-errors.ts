/**
 * Maps Supabase auth error messages (always in English) to Spanish.
 * Falls back to the original message if no match is found.
 */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase()

  // ── Credentials ───────────────────────────────────────────────────────────
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return 'Correo o contraseña incorrectos.'

  if (m.includes('email not confirmed'))
    return 'Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada y haz clic en el enlace de activación.'

  // ── Registration ──────────────────────────────────────────────────────────
  if (m.includes('user already registered') || m.includes('email already in use') || m.includes('already registered'))
    return 'Ya existe una cuenta con este correo electrónico.'

  if (m.includes('signup requires a valid password') || m.includes('password is required'))
    return 'Debes ingresar una contraseña.'

  if (m.includes('password should be at least'))
    return 'La contraseña debe tener al menos 6 caracteres.'

  if (m.includes('weak_password') || m.includes('password is too weak') || m.includes('should be stronger'))
    return 'La contraseña es demasiado débil. Usa letras, números y símbolos.'

  if (m.includes('same_password') || m.includes('new password should be different'))
    return 'La nueva contraseña debe ser distinta a la actual.'

  // ── Email / token ─────────────────────────────────────────────────────────
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('email_address_invalid'))
    return 'El formato del correo electrónico no es válido.'

  if (m.includes('token has expired') || m.includes('otp expired') || m.includes('otp_expired'))
    return 'El enlace ha expirado. Solicita uno nuevo.'

  if (m.includes('token is invalid') || m.includes('invalid token'))
    return 'El enlace no es válido.'

  if (m.includes('email link is invalid or has expired'))
    return 'El enlace de confirmación es inválido o ha expirado.'

  // ── Rate limits ───────────────────────────────────────────────────────────
  if (m.includes('email rate limit exceeded') || m.includes('over_email_send_rate_limit'))
    return 'Demasiados correos enviados. Espera unos minutos antes de intentarlo de nuevo.'

  if (m.includes('for security purposes, you can only request this after') || m.includes('over_request_rate_limit'))
    return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.'

  if (m.includes('too many requests'))
    return 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.'

  // ── Session ───────────────────────────────────────────────────────────────
  if (m.includes('auth session missing') || m.includes('no session'))
    return 'La sesión no está disponible. Por favor inicia sesión de nuevo.'

  if (m.includes('session expired') || m.includes('jwt expired'))
    return 'Tu sesión ha expirado. Vuelve a iniciar sesión.'

  if (m.includes('user not found'))
    return 'No existe una cuenta con este correo electrónico.'

  if (m.includes('signup_disabled') || m.includes('signups not allowed'))
    return 'El registro de nuevas cuentas no está disponible en este momento.'

  // Fallback — return as-is so nothing is silently swallowed
  return message
}
