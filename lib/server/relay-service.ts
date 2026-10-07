/**
 * The relay worker (relay/: market history and public profiles), reached from
 * the site's server code.
 *
 * On Cloudflare it is the HISTORY_SERVICE binding (wrangler.jsonc): a Pages
 * function cannot fetch() a worker routed on its own zone. Elsewhere (local
 * development) there is no binding and the URL is fetched directly.
 */

type Fetcher = { fetch: (req: Request) => Promise<Response> }

function binding(): Fetcher | null {
  // next-on-pages keeps the request's bindings here (what its getRequestContext reads;
  // importing that pulls in `server-only`, which the unit tests cannot load).
  const ctx = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[Symbol.for('__cloudflare-request-context__')]
  const svc = ctx?.env?.HISTORY_SERVICE as Fetcher | undefined
  return svc && typeof svc.fetch === 'function' ? svc : null
}

export async function relayGet<T>(url: string, what: string, timeoutMs = 6_000): Promise<T> {
  const svc = binding()
  const req = new Request(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
  const res = await (svc ? svc.fetch(req) : fetch(req))
  if (!res.ok) throw new Error(`${what} ${svc ? '(binding) ' : ''}HTTP ${res.status}`)
  return (await res.json()) as T
}
