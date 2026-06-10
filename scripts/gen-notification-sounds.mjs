/**
 * Generates DayFlow's curated notification-sound set as 16-bit PCM mono WAV
 * files, written to BOTH:
 *   - public/sounds/<id>.wav            (web in-app preview via <audio>)
 *   - android/app/src/main/res/raw/notif_<id>.wav  (Android channel sound)
 *
 * The sounds are original syntheses deliberately modeled on the *families*
 * of notification tones people already know and like from popular apps
 * (a clean tri-tone "ding", a glassy ascending chime, a warm marimba, a
 * Messenger-style bubble "pop", a soft single bell, and a crisp double beep).
 * Nothing here samples or copies any copyrighted audio — they're built from
 * additive synthesis so we can ship them royalty-free inside the APK.
 *
 * Run:  node scripts/gen-notification-sounds.mjs
 * Re-run any time to regenerate; output is deterministic.
 *
 * NOTE: the registry of ids here must stay in sync with lib/notification-sounds.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SR = 44100 // sample rate

// ── tiny synth helpers ──────────────────────────────────────────────────────
const TAU = Math.PI * 2

/** Raised-cosine attack (avoids click at note onset) over `ms` milliseconds. */
function attackGain(tSec, ms) {
  const a = ms / 1000
  if (tSec >= a) return 1
  return 0.5 - 0.5 * Math.cos((tSec / a) * Math.PI)
}

/**
 * Add a struck-resonator note (bell / marimba / pluck) into `buf` starting at
 * `t0` seconds. `partials` is a list of { ratio, gain, decay } where decay is
 * the time-constant (seconds) of the exponential amplitude envelope for that
 * partial — higher partials usually decay faster, which is what gives bells
 * and marimbas their characteristic timbre.
 */
function addNote(buf, t0, freq, partials, { gain = 1, attackMs = 4 } = {}) {
  const start = Math.floor(t0 * SR)
  // Ring until the slowest partial has effectively died out.
  const maxDecay = Math.max(...partials.map(p => p.decay))
  const len = Math.floor(maxDecay * 6 * SR)
  for (let i = 0; i < len; i++) {
    const n = start + i
    if (n >= buf.length) break
    const t = i / SR
    const atk = attackGain(t, attackMs)
    let s = 0
    for (const p of partials) {
      s += p.gain * Math.exp(-t / p.decay) * Math.sin(TAU * freq * p.ratio * t)
    }
    buf[n] += gain * atk * s
  }
}

/** Add a frequency-swept "droplet/pop": pitch glides from f0→f1 fast. */
function addPop(buf, t0, f0, f1, dur, { gain = 1 } = {}) {
  const start = Math.floor(t0 * SR)
  const len = Math.floor(dur * SR)
  let phase = 0
  for (let i = 0; i < len; i++) {
    const n = start + i
    if (n >= buf.length) break
    const t = i / SR
    const k = t / dur
    // Exponential pitch glide, snappy amplitude decay.
    const f = f0 * Math.pow(f1 / f0, k)
    phase += (TAU * f) / SR
    const env = Math.exp(-t / (dur * 0.34)) * attackGain(t, 2)
    const s = Math.sin(phase) + 0.25 * Math.sin(2 * phase)
    buf[n] += gain * env * s
  }
}

/** Add a clean digital beep (sine + light odd harmonics) with soft edges. */
function addBeep(buf, t0, freq, dur, { gain = 1 } = {}) {
  const start = Math.floor(t0 * SR)
  const len = Math.floor(dur * SR)
  const fade = Math.floor(0.008 * SR)
  for (let i = 0; i < len; i++) {
    const n = start + i
    if (n >= buf.length) break
    const t = i / SR
    let env = 1
    if (i < fade) env = i / fade
    else if (i > len - fade) env = (len - i) / fade
    const s = Math.sin(TAU * freq * t) + 0.18 * Math.sin(TAU * freq * 3 * t)
    buf[n] += gain * env * s
  }
}

// Bell / marimba partial recipes.
const bell = (decay = 0.55) => [
  { ratio: 1.0, gain: 1.0, decay },
  { ratio: 2.01, gain: 0.6, decay: decay * 0.7 },
  { ratio: 3.0, gain: 0.34, decay: decay * 0.5 },
  { ratio: 4.2, gain: 0.2, decay: decay * 0.4 },
]
const marimba = (decay = 0.32) => [
  { ratio: 1.0, gain: 1.0, decay },
  { ratio: 3.92, gain: 0.5, decay: decay * 0.45 },
  { ratio: 10.4, gain: 0.14, decay: decay * 0.25 },
]

// ── the six sounds ──────────────────────────────────────────────────────────
// freqs: C5=523 D5=587 E5=659 G5=784 A5=880 B5=988 C6=1047 E6=1319 G6=1568 C7=2093
const SOUNDS = {
  // Classic three-note ascending "ding" — the tri-tone family (clean, noticeable).
  ding(buf) {
    addNote(buf, 0.0, 784, bell(0.5))
    addNote(buf, 0.12, 988, bell(0.5))
    addNote(buf, 0.24, 1319, bell(0.6))
  },
  // Glassy four-note ascending chime — uplifting, rings together (soft-noticeable).
  chime(buf) {
    addNote(buf, 0.0, 1047, bell(0.7), { gain: 0.85 })
    addNote(buf, 0.1, 1319, bell(0.7), { gain: 0.85 })
    addNote(buf, 0.2, 1568, bell(0.75), { gain: 0.85 })
    addNote(buf, 0.32, 2093, bell(0.85), { gain: 0.8 })
  },
  // Warm two-note marimba — gentle, the friendly default family (soft).
  marimba(buf) {
    addNote(buf, 0.0, 523, marimba(0.34))
    addNote(buf, 0.15, 784, marimba(0.36))
  },
  // Bubble "pop" droplet — playful, Messenger-style (soft).
  pop(buf) {
    addPop(buf, 0.0, 430, 1080, 0.16)
    addPop(buf, 0.085, 320, 760, 0.12, { gain: 0.5 })
  },
  // Single warm bell "ping" — minimal, calm (soft-noticeable).
  bell(buf) {
    addNote(buf, 0.0, 880, bell(0.8))
  },
  // Crisp double beep — clearly attention-grabbing for users who want to notice.
  alert(buf) {
    addBeep(buf, 0.0, 1046, 0.11)
    addBeep(buf, 0.17, 1046, 0.13)
  },
}

const DURATION = { ding: 0.95, chime: 1.25, marimba: 0.75, pop: 0.26, bell: 1.05, alert: 0.33 }

// ── WAV encoding ────────────────────────────────────────────────────────────
function encodeWav(float) {
  // Normalize to -1.5 dBFS peak.
  let peak = 0
  for (const v of float) peak = Math.max(peak, Math.abs(v))
  const norm = peak > 0 ? 0.84 / peak : 1
  const data = Buffer.alloc(float.length * 2)
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i] * norm))
    data.writeInt16LE(Math.round(s * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SR, 24)
  header.writeUInt32LE(SR * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

// ── generate ────────────────────────────────────────────────────────────────
const webDir = join(ROOT, 'public', 'sounds')
const rawDir = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw')
mkdirSync(webDir, { recursive: true })
mkdirSync(rawDir, { recursive: true })

for (const [id, render] of Object.entries(SOUNDS)) {
  const buf = new Float32Array(Math.ceil(DURATION[id] * SR))
  render(buf)
  const wav = encodeWav(buf)
  writeFileSync(join(webDir, `${id}.wav`), wav)
  writeFileSync(join(rawDir, `notif_${id}.wav`), wav)
  console.log(`  ${id.padEnd(8)} ${(wav.length / 1024).toFixed(0)} KB`)
}
console.log('Done. Wrote', Object.keys(SOUNDS).length, 'sounds to public/sounds + res/raw.')
