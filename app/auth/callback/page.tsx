'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function AuthCallbackPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = async () => {
      // Read params from window.location to avoid the Next.js Suspense requirement
      const params = new URLSearchParams(window.location.search)
      const code   = params.get('code')
      const errMsg = params.get('error_description') || params.get('error')

      if (errMsg) {
        setError(decodeURIComponent(errMsg))
        return
      }

      if (code) {
        // Exchange the one-time code for a session (PKCE flow used by Supabase by default)
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeErr) {
          setError(exchangeErr.message)
          return
        }
      }

      // After the exchange, check what kind of session was created
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('No se pudo verificar la sesión. El enlace puede haber expirado.')
        return
      }

      // If this was a password-reset link, send to the reset form; otherwise to the dashboard
      const isRecovery = (session.user as any)?.recovery_sent_at
        || params.get('type') === 'recovery'

      router.replace(isRecovery ? '/auth/reset-password' : '/dashboard')
      router.refresh()
    }

    handle()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-semibold mb-2">Enlace inválido</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-muted-foreground">Verificando tu cuenta…</p>
      </div>
    </div>
  )
}
