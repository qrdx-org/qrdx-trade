/**
 * Isolate-local TTL cache with in-flight de-duplication.
 *
 * Route handlers on the edge share module state within an isolate, so a burst of
 * page loads asking for the same book becomes one node call. Nothing here is
 * durable or shared across isolates; it only trims upstream load.
 */

interface Entry<T> {
  value?: T
  expires: number
  pending?: Promise<T>
}

const store = new Map<string, Entry<unknown>>()
const MAX_ENTRIES = 2_000

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key) as Entry<T> | undefined
  if (hit) {
    if (hit.value !== undefined && hit.expires > now) return hit.value
    if (hit.pending) return hit.pending
  }
  const pending = load().then(
    (value) => {
      store.set(key, { value, expires: Date.now() + ttlMs })
      return value
    },
    (err) => {
      store.delete(key)
      throw err
    }
  )
  store.set(key, { ...(hit ?? { expires: 0 }), pending })
  if (store.size > MAX_ENTRIES) {
    // Drop the oldest insertions; Map iterates in insertion order.
    for (const k of store.keys()) {
      store.delete(k)
      if (store.size <= MAX_ENTRIES * 0.9) break
    }
  }
  return pending
}

/** Last successful value regardless of age, for "stale" fallbacks. */
export function peek<T>(key: string): T | undefined {
  return (store.get(key) as Entry<T> | undefined)?.value
}
