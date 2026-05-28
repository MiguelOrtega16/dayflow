// Module-level suppression store for the bottom AdMob banner. The banner is
// a NATIVE Android view rendered outside the WebView, so it sits on top of
// every React surface — including the sidebar drawer, paywall modal, and
// the force-update gate. When those open, the banner blocks taps on bottom
// UI (Settings menu item, modal CTAs, etc.). Components that own an
// overlay call pushAdSuppress('sidebar') / etc. and call the returned
// cleanup on close; AdBanner subscribes and removes the banner whenever
// any source is active, then re-shows when the set empties.
//
// Lives outside React so non-component code (e.g. imperative drawer
// handlers) can also use it without prop drilling.

const listeners = new Set<() => void>()
const sources = new Set<string>()

export function getAdSuppressed(): boolean {
  return sources.size > 0
}

export function subscribeAdSuppress(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Mark a source as currently obscuring the banner. Returns a cleanup that
 * pops the source. Safe to call multiple times with the same label — the
 * Set dedupes, and the cleanup only removes one entry.
 */
export function pushAdSuppress(source: string): () => void {
  sources.add(source)
  notify()
  let cleaned = false
  return () => {
    if (cleaned) return
    cleaned = true
    sources.delete(source)
    notify()
  }
}

function notify() {
  listeners.forEach(l => {
    try { l() } catch { /* listener errors are not our problem */ }
  })
}
