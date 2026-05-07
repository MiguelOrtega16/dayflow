'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📧</span>
          </div>
          <h2 className="text-2xl font-semibold mb-2">Revisa tu correo</h2>
          <p className="text-muted-foreground mb-6">
            Enviamos un enlace para restablecer tu contraseña a{' '}
            <strong>{email}</strong>. Expira en 1 hora.
          </p>
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-2xl">DayFlow</span>
        </div>

        <h2 className="text-3xl font-semibold mb-2">¿Olvidaste tu contraseña?</h2>
        <p className="text-muted-foreground mb-8">
          Escribe tu correo y te enviaremos un enlace para restablecerla.
        </p>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              required
              autoFocus
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Enviando…' : 'Enviar enlace de restablecimiento'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
