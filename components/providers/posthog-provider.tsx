'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { capturePageView, identify, initAnalytics, resetIdentity } from '@/lib/analytics/posthog'
import { createClient } from '@/lib/supabase/client'

function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    const qs = searchParams?.toString()
    capturePageView(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics()
  }, [])

  // Keeps PostHog's distinct_id linked to the current Supabase user across
  // returning visits. We identify by opaque user id only (no email/name) — see
  // the note in lib/analytics/posthog.ts. This handler is the safety net for
  // already-signed-in users hitting the app on a fresh browser.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (session?.user?.id) identify(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        resetIdentity()
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  )
}
