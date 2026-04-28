import { addDays, getDay, format } from 'date-fns'

// Anonymous Gregorian algorithm for Easter Sunday
function easterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

// Ley Emiliani: if the date is not Monday, move it to the next Monday
function toNextMonday(date: Date): Date {
  const dow = getDay(date) // 0 = Sunday
  if (dow === 1) return date
  return addDays(date, dow === 0 ? 1 : 8 - dow)
}

/**
 * Returns a Map<YYYY-MM-DD, holiday name> for all Colombian public holidays
 * in the given year, including Ley Emiliani-shifted dates.
 */
export function getColombiaHolidays(year: number): Map<string, string> {
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  const fixed = (m: number, d: number) => new Date(year, m - 1, d)
  const moved = (d: Date) => fmt(toNextMonday(d))

  const easter = easterDate(year)

  const entries: [string, string][] = [
    // ── Festivos de fecha fija ──────────────────────────────────────────────
    [fmt(fixed(1, 1)),  'Año Nuevo'],
    [fmt(fixed(5, 1)),  'Día del Trabajo'],
    [fmt(fixed(7, 20)), 'Día de la Independencia'],
    [fmt(fixed(8, 7)),  'Batalla de Boyacá'],
    [fmt(fixed(12, 8)), 'Inmaculada Concepción'],
    [fmt(fixed(12, 25)),'Navidad'],

    // ── Semana Santa (fijos respecto a Pascua) ─────────────────────────────
    [fmt(addDays(easter, -3)), 'Jueves Santo'],
    [fmt(addDays(easter, -2)), 'Viernes Santo'],

    // ── Ley Emiliani — traslado al lunes siguiente ─────────────────────────
    [moved(fixed(1, 6)),          'Reyes Magos'],
    [moved(fixed(3, 19)),         'San José'],
    [moved(addDays(easter, 39)),  'Ascensión del Señor'],
    [moved(addDays(easter, 60)),  'Corpus Christi'],
    [moved(addDays(easter, 71)),  'Sagrado Corazón'],
    [moved(fixed(6, 29)),         'San Pedro y San Pablo'],
    [moved(fixed(8, 15)),         'Asunción de la Virgen'],
    [moved(fixed(10, 12)),        'Día de la Raza'],
    [moved(fixed(11, 1)),         'Todos los Santos'],
    [moved(fixed(11, 11)),        'Independencia de Cartagena'],
  ]

  return new Map(entries)
}
