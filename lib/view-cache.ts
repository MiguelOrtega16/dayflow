// Tiny in-memory stale-while-revalidate cache for client views (Stats, Tasks,
// Calendar). The goal is purely perceived speed: when the user returns to a
// screen (or toggles a range) we render the last data we saw *instantly* and
// refetch in the background, instead of showing a skeleton every time.
//
// Scope/lifetime: module-level, so it survives client-side navigations within
// a session but is dropped on a full reload. It is NOT a correctness layer —
// every consumer still refetches and overwrites, so staleness is at most until
// the in-flight revalidation returns.
const store = new Map<string, unknown>()

export function getCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined
}

export function setCache<T>(key: string, value: T): void {
  store.set(key, value)
}

/** Drop every entry whose key starts with `prefix` (e.g. all of one user's). */
export function clearCacheByPrefix(prefix: string): void {
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
