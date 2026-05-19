/**
 * Synthesize a short preview clip per ringtone preset. Used by the settings
 * page so the user can hear what they're picking before they pick it.
 *
 * These are intentionally procedural (Web Audio) rather than bundled WAV
 * files — the cron-side notification sound still comes from the device's
 * notification channel default; this helper just gives the user audible
 * differentiation between the named presets in-app. When we later add real
 * audio assets, this file can be replaced with HTMLAudioElement playback
 * against /public/sounds/*.wav.
 */

import type { Ringtone } from '@/lib/user-preferences'

type Beat = {
  freq:   number  // Hz
  start:  number  // seconds, relative to playback start
  dur:    number  // seconds
  gain?:  number  // 0..1, defaults to 0.25
  type?:  OscillatorType  // defaults to 'sine'
}

// Hand-tuned beats per ringtone so each one sounds distinct in the picker.
const SCORES: Record<Ringtone, Beat[]> = {
  system: [
    { freq: 880, start: 0,     dur: 0.18, type: 'sine' },
  ],
  gentle: [
    { freq: 660, start: 0,     dur: 0.16, gain: 0.18, type: 'sine' },
    { freq: 660, start: 0.22,  dur: 0.16, gain: 0.18, type: 'sine' },
    { freq: 880, start: 0.44,  dur: 0.22, gain: 0.18, type: 'sine' },
  ],
  chime: [
    { freq: 1318, start: 0,    dur: 0.16, type: 'sine' },  // E6
    { freq: 1175, start: 0.12, dur: 0.16, type: 'sine' },  // D6
    { freq: 988,  start: 0.24, dur: 0.16, type: 'sine' },  // B5
    { freq: 784,  start: 0.36, dur: 0.32, type: 'sine' },  // G5
  ],
  digital: [
    { freq: 1200, start: 0,    dur: 0.08, gain: 0.22, type: 'square' },
    { freq: 1600, start: 0.12, dur: 0.08, gain: 0.22, type: 'square' },
  ],
  marimba: [
    { freq: 523,  start: 0,    dur: 0.16, type: 'triangle' },  // C5
    { freq: 659,  start: 0.12, dur: 0.16, type: 'triangle' },  // E5
    { freq: 784,  start: 0.24, dur: 0.16, type: 'triangle' },  // G5
    { freq: 1046, start: 0.36, dur: 0.30, type: 'triangle' },  // C6
  ],
  bell: [
    { freq: 880,  start: 0,    dur: 1.20, gain: 0.30, type: 'sine' },
    // Soft fifth on top for a bell-like overtone
    { freq: 1320, start: 0,    dur: 1.20, gain: 0.12, type: 'sine' },
  ],
}

// Reuse a single AudioContext — Chromium/WebKit cap the number of live
// contexts per tab pretty aggressively. Lazily created so SSR is safe.
let cachedCtx: AudioContext | null = null
function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (cachedCtx) return cachedCtx
  const Ctor = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
              ?? window.AudioContext
  if (!Ctor) return null
  cachedCtx = new Ctor()
  return cachedCtx
}

/**
 * Plays the preview clip for the given ringtone. Fire-and-forget — returns
 * a promise that resolves when scheduling is done, not when audio finishes.
 */
export async function playRingtonePreview(name: Ringtone): Promise<void> {
  const ctx = audioCtx()
  if (!ctx) return
  // Suspended state happens when the page hasn't had a user gesture yet,
  // or after the OS suspends audio. resume() is a no-op if already running.
  if (ctx.state === 'suspended') {
    try { await ctx.resume() } catch { /* ignored */ }
  }

  const score = SCORES[name] ?? SCORES.system
  const t0 = ctx.currentTime

  for (const beat of score) {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = beat.type ?? 'sine'
    osc.frequency.value = beat.freq

    // Linear attack + exponential decay envelope so beats don't click.
    const peak = beat.gain ?? 0.25
    const start = t0 + beat.start
    const end   = start + beat.dur
    env.gain.setValueAtTime(0, start)
    env.gain.linearRampToValueAtTime(peak, start + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.connect(env).connect(ctx.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }
}
