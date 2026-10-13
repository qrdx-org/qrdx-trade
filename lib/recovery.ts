/**
 * Getting the site out of a crash without clearing the browser's data.
 *
 * A client-side exception used to leave Next's bare "Application error" screen, and when
 * the cause was something this site had saved (a phone wallet session, a pending
 * transaction list), every reload crashed again until the user cleared Safari's website
 * data. The error screens (app/error.tsx, app/(trading)/error.tsx, app/global-error.tsx)
 * offer to clear what the site saves, and reload once by themselves when the page's code
 * was replaced by a deploy.
 */

/** Kept on reset: they are validated when read and cannot break a page. */
const KEEP = new Set(['qrdx-trade:favorites', 'qrdx-trade:chart-kind', 'theme'])

/**
 * Clears the wallet link and phone session, the network choice, tracked transactions and
 * launch progress (every `qrdx-trade:` key but favourites and the chart style).
 */
export async function resetSavedState(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('qrdx-trade:') && !KEEP.has(key)) localStorage.removeItem(key)
  } catch {
    /* storage unavailable: nothing to clear */
  }
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  } catch {
    /* none */
  }
}

/**
 * A chunk of the page's code failed to load: a deploy replaced it while this page (or one
 * the browser restored) still referred to the old build. A fresh load fixes it.
 */
export function isStaleBuild(error: unknown): boolean {
  const text = `${(error as Error)?.name ?? ''} ${(error as Error)?.message ?? error}`
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load chunk/i.test(text)
}

const RELOADED = 'qrdx-trade:reloaded-for-build'

/** Reload for a stale build, at most once a minute in a tab (so a lasting failure cannot loop). */
export function reloadForStaleBuild(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 60_000) return false
    sessionStorage.setItem(RELOADED, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
