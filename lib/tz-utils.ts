/** ms offset between UTC and the given IANA timezone at a specific instant.
 *  Positive = tz is behind UTC (e.g. America/Bogota = +18_000_000).
 */
function tzOffsetMs(instant: Date, tz: string): number {
  const toMs = (timezone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(instant)
    const p: Record<string, number> = {}
    for (const { type, value } of parts) p[type] = Number(value)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second)
  }
  return toMs('UTC') - toMs(tz)
}

/** Convert a local date + time (as stored in DB) to a UTC Date, DST-aware. */
export function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`)
  return new Date(naive.getTime() + tzOffsetMs(naive, tz))
}

/** YYYY-MM-DD in the given timezone for a UTC instant. */
export function localDateStr(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
}

/** 0–23 hour in the given timezone for a UTC instant. */
export function localHour(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', hour12: false,
  }).formatToParts(now)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0')
}
