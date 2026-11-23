import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Supabase (PostgREST) silently caps every response at `max_rows` — 1000 on
 * hosted projects by default. There is no error and no flag: the array just
 * comes back shorter. Any query whose result grows with the user's history
 * (activities over a date window, accepted invitations, …) must page through
 * it with `.range()`, or heavy users lose rows without anyone noticing.
 *
 * Keep this equal to the project's max rows (Dashboard → Settings → API).
 * If that setting is ever lowered below this value, a short page would look
 * like the last one and results would be truncated again.
 */
export const SUPABASE_MAX_ROWS = 1000

/**
 * Max values per `.in()` filter. The list travels in the request URL (~40
 * characters per UUID once encoded), so a few thousand ids would exceed the
 * URL limits of the API gateway.
 */
export const IN_FILTER_CHUNK = 150

type Page<T> = { data: T[] | null; error: PostgrestError | null }

/** Splits `values` into `.in()`-sized chunks (see IN_FILTER_CHUNK). */
export function chunkForInFilter<V>(values: readonly V[], size = IN_FILTER_CHUNK): V[][] {
  const chunks: V[][] = []
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size))
  return chunks
}

/**
 * Fetches every row of a query, page by page, until a short page comes back.
 *
 * `build(from, to)` must return a fresh query ending in `.range(from, to)`,
 * ordered by a unique column (add `.order('id')` as the last tiebreaker) —
 * otherwise rows can repeat or go missing between pages.
 *
 * Mirrors Supabase's `{ data, error }` shape: on any error, `data` is null.
 */
export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<Page<T>> {
  const rows: T[] = []
  for (let from = 0; ; from += SUPABASE_MAX_ROWS) {
    const { data, error } = await build(from, from + SUPABASE_MAX_ROWS - 1)
    if (error) return { data: null, error }
    const page = data ?? []
    for (const row of page) rows.push(row)
    if (page.length < SUPABASE_MAX_ROWS) return { data: rows, error: null }
  }
}

/**
 * `fetchAllPages` for a query filtered with `.in(column, values)`: splits the
 * values into URL-safe chunks, pages through each chunk (in parallel) and
 * concatenates the results. Same `{ data, error }` contract.
 */
export async function fetchAllInChunks<T, V>(
  values: readonly V[],
  build: (chunk: V[], from: number, to: number) => PromiseLike<Page<T>>,
): Promise<Page<T>> {
  if (values.length === 0) return { data: [], error: null }
  const results = await Promise.all(
    chunkForInFilter(values).map(chunk => fetchAllPages<T>((from, to) => build(chunk, from, to))),
  )
  const failed = results.find(r => r.error)
  if (failed) return { data: null, error: failed.error }
  return { data: results.flatMap(r => r.data ?? []), error: null }
}
