/**
 * Client for the market history service (relay/src/history-do.ts): pool
 * prices and volumes sampled every minute by the worker's cron, for charts
 * and 24 h change where the node itself keeps no history.
 */

import type { HistoryCandle, HistoryStats } from '../../relay/src/history'
import { cached } from './cache'
import type { Net } from './net'

const TIMEOUT_MS = 6_000

type Fetcher = { fetch: (req: Request) => Promise<Response> }

/**
 * On Cloudflare the worker is reached through the HISTORY_SERVICE binding
 * (wrangler.jsonc): a Pages function cannot fetch() a worker routed on its own
 * zone. Elsewhere (local development) there is no binding and the URL is used.
 */
function historyService(): Fetcher | null {
  // next-on-pages keeps the request's bindings here (what its getRequestContext reads;
  // importing that pulls in `server-only`, which the unit tests cannot load).
  const ctx = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[Symbol.for('__cloudflare-request-context__')]
  const svc = ctx?.env?.HISTORY_SERVICE as Fetcher | undefined
  return svc && typeof svc.fetch === 'function' ? svc : null
}

async function get<T>(net: Net, path: string): Promise<T> {
  const url = `${net.cfg.historyUrl}/v1/${net.cfg.id}/${path}`
  const svc = historyService()
  const req = new Request(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  const res = await (svc ? svc.fetch(req) : fetch(req))
  if (!res.ok) throw new Error(`history ${svc ? '(binding) ' : ''}HTTP ${res.status} for ${path.split('?')[0]}`)
  return (await res.json()) as T
}

const warned = new Set<string>()
/** Charts still render without history, so a failure is logged (once per isolate and kind), not thrown. */
function warn(kind: string, e: unknown) {
  if (warned.has(kind)) return
  warned.add(kind)
  console.warn(`[history] ${kind}: ${(e as Error).message}`)
}

export function poolCandles(net: Net, poolId: string, seconds: number, limit: number): Promise<HistoryCandle[]> {
  return cached(net.key(`hist-candles:${poolId}:${seconds}:${limit}`), 30_000, async () =>
    (await get<{ candles: HistoryCandle[] }>(net, `candles?market=pool:${encodeURIComponent(poolId)}&interval=${seconds}&limit=${limit}`)).candles
  ).catch((e) => {
    warn('candles', e)
    return []
  })
}

/** 24 h stats for many pools; missing or unreachable history yields an empty map. */
export async function poolStats(net: Net, poolIds: string[]): Promise<Record<string, HistoryStats>> {
  if (!poolIds.length) return {}
  const key = [...new Set(poolIds)].sort()
  return cached(net.key(`hist-stats:${key.join(',')}`), 30_000, async () => {
    const out: Record<string, HistoryStats> = {}
    for (let i = 0; i < key.length; i += 200) {
      const chunk = key.slice(i, i + 200)
      const r = await get<{ stats: Record<string, HistoryStats> }>(net, `stats?markets=${chunk.map((p) => `pool:${p}`).join(',')}`)
      for (const [m, s] of Object.entries(r.stats)) out[m.slice('pool:'.length)] = s
    }
    return out
  }).catch((e) => {
    warn('stats', e)
    return {}
  })
}

export type { HistoryCandle, HistoryStats }
