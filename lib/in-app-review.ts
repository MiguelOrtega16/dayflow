// In-app review prompt (Google Play In-App Review API via @capawesome/capacitor-app-review).
//
// Strategy: ask for a review only at genuine "happy moments" — right after the
// user completes activities — and layer our own guardrails on top of Play's
// quota so we never feel naggy:
//   - only after enough completions to have real signal (first ask at 5),
//   - at widening milestones (5 → 25 → 125), never every completion,
//   - never more than MAX_PROMPTS times, never within COOLDOWN of the last ask.
//
// Per Play policy we never ask "do you like the app?" first — we just trigger
// the native sheet and let Play decide whether to actually show it. Web and iOS
// are no-ops here (Android-only by design, like the AdMob wrapper).

import { Capacitor } from '@capacitor/core'

const COMPLETIONS_KEY = 'dayflow:review_completions'
const PROMPTS_KEY      = 'dayflow:review_prompts'
const LAST_PROMPT_KEY  = 'dayflow:review_last_prompt'

const FIRST_MILESTONE = 5   // completions before the first ask
const MAX_PROMPTS     = 3   // lifetime cap on our side (Play also caps)
const COOLDOWN_DAYS   = 45
const DAY_MS = 86_400_000

const isAndroidNative = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

function readNum(key: string): number {
  if (typeof localStorage === 'undefined') return 0
  const v = Number(localStorage.getItem(key))
  return Number.isFinite(v) ? v : 0
}

/**
 * Record an activity completion and, if it crosses the next review milestone,
 * trigger the native in-app review sheet. Fire-and-forget: no-ops off native
 * Android, never throws, never blocks the caller.
 */
export function reviewOnActivityCompleted(): void {
  if (!isAndroidNative() || typeof localStorage === 'undefined') return
  try {
    const completions = readNum(COMPLETIONS_KEY) + 1
    localStorage.setItem(COMPLETIONS_KEY, String(completions))

    const prompts = readNum(PROMPTS_KEY)
    if (prompts >= MAX_PROMPTS) return

    const lastPrompt = readNum(LAST_PROMPT_KEY)
    if (lastPrompt && Date.now() - lastPrompt < COOLDOWN_DAYS * DAY_MS) return

    // Widening milestones: 5, 25, 125 completions for prompt 1, 2, 3.
    const milestone = FIRST_MILESTONE * Math.pow(5, prompts)
    if (completions < milestone) return

    void requestReview()
  } catch {
    /* review logic must never affect the completion flow */
  }
}

async function requestReview(): Promise<void> {
  try {
    const { AppReview } = await import('@capawesome/capacitor-app-review')
    await AppReview.requestReview()
    // Count the attempt regardless of whether Play showed the sheet (the API
    // intentionally hides that), so MAX_PROMPTS + cooldown are respected.
    localStorage.setItem(PROMPTS_KEY, String(readNum(PROMPTS_KEY) + 1))
    localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()))
  } catch (err) {
    console.error('[in-app-review] requestReview failed', err)
  }
}
