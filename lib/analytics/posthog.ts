'use client'

import posthog from 'posthog-js'
import { Capacitor } from '@capacitor/core'

type AnalyticsEvent =
  | 'user_signed_up'
  | 'user_logged_in'
  | 'user_logged_out'
  | 'activity_created'
  | 'goal_created'
  | 'paywall_viewed'
  | 'paywall_plan_selected'
  | 'paywall_dismissed'
  | 'subscription_started'
  | 'subscription_cancelled'
  | 'starter_picker_shown'
  | 'starter_pack_selected'
  | 'starter_pack_inserted'
  | 'starter_picker_skipped'
  | 'setup_checklist_shown'
  | 'setup_checklist_step_clicked'
  | 'setup_checklist_dismissed'
  | 'setup_checklist_completed'
  | 'page_tour_shown'
  | 'page_tour_dismissed'

type EventProps = Record<string, string | number | boolean | null | undefined>

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
// Direct ingest URL — used on the Capacitor native client (no browser
// extensions to dodge) and as the canonical UI host for autocapture links.
const DIRECT_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const UI_HOST = 'https://us.posthog.com'

let initialized = false

export function initAnalytics() {
  if (initialized || typeof window === 'undefined' || !KEY) return
  // Web hits the Next.js /ingest reverse proxy so requests look first-party
  // and bypass Firefox ETP / uBlock / Brave Shields. Native Capacitor builds
  // can't run server rewrites (static export) but also don't need the proxy —
  // webviews are immune to browser extensions.
  const apiHost = Capacitor.isNativePlatform() ? DIRECT_HOST : '/ingest'
  posthog.init(KEY, {
    api_host: apiHost,
    ui_host: UI_HOST,
    persistence: 'localStorage',
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    ip: false,
    loaded: (ph) => {
      if (process.env.NEXT_PUBLIC_ENV === 'development') ph.debug(false)
    },
  })
  initialized = true
}

export function track(event: AnalyticsEvent, props?: EventProps) {
  if (!KEY || typeof window === 'undefined') return
  if (!initialized) initAnalytics()
  posthog.capture(event, props)
}

export function identify(userId: string, traits?: EventProps) {
  if (!KEY || typeof window === 'undefined') return
  if (!initialized) initAnalytics()
  posthog.identify(userId, traits)
}

export function resetIdentity() {
  if (!KEY || typeof window === 'undefined' || !initialized) return
  posthog.reset()
}

export function capturePageView(url: string) {
  if (!KEY || typeof window === 'undefined') return
  if (!initialized) initAnalytics()
  posthog.capture('$pageview', { $current_url: url })
}
