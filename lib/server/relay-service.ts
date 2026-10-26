/**
 * The site's stateful services (relay/: market history, public profiles, the NFT
 * market registry), reached from the site's server code.
 *
 * On Cloudflare they run in this same Worker (worker.ts), reached through the
 * WORKER_SELF_REFERENCE binding (wrangler.jsonc): a Worker cannot fetch() its own
 * routes over the network. Elsewhere (`next dev`, unit tests) there is no binding
 * and the URL is fetched directly.
 */

type Fetcher = { fetch: (req: Request) => Promise<Response> }

function binding(): Fetcher | null {
  // The OpenNext adapter keeps the Worker's env here (what its getCloudflareContext reads;
  // importing that here would tie the unit tests to the adapter). `next dev` has the bindings
  // too (next.config.mjs), but the Next dev server does not serve the services: development
  // fetches their URLs (production, or QRDX_HISTORY_URL / QRDX_PROFILES_URL).
  if (process.env.NODE_ENV === 'development') return null
  const ctx = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[Symbol.for('__cloudflare-context__')]
  const svc = ctx?.env?.WORKER_SELF_REFERENCE as Fetcher | undefined
  return svc && typeof svc.fetch === 'function' ? svc : null
}

export async function relayGet<T>(url: string, what: string, timeoutMs = 6_000): Promise<T> {
  const svc = binding()
  const req = new Request(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
  const res = await (svc ? svc.fetch(req) : fetch(req))
  if (!res.ok) throw new Error(`${what} ${svc ? '(binding) ' : ''}HTTP ${res.status}`)
  return (await res.json()) as T
}

/** POST JSON to the relay; its answer, or an error carrying the relay's message. */
export async function relayPost<T>(url: string, body: unknown, what: string, timeoutMs = 15_000): Promise<T> {
  const svc = binding()
  const req = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  const res = await (svc ? svc.fetch(req) : fetch(req))
  const out = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(out?.error ?? `${what} HTTP ${res.status}`)
  return out as T
}
