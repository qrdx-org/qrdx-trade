/**
 * Client for the market history service (relay/src/history-do.ts): pool
 * prices and volumes sampled every minute by the worker's cron, for charts
 * and 24 h change where the node itself keeps no history.
 */

import type { HistoryCandle, HistoryStats } from '../../relay/src/history'
import { cached } from './cache'
import type { Net } from './net'

const TIMEOUT_MS = 6_000

async function get<T>(net: Net, path: string): Promise<T> {
  const res = await fetch(`${net.cfg.historyUrl}/v1/${net.cfg.id}/${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`history HTTP ${res.status}`)
  return (await res.json()) as T
}

export function poolCandles(net: Net, poolId: string, seconds: number, limit: number): Promise<HistoryCandle[]> {
  return cached(net.key(`hist-candles:${poolId}:${seconds}:${limit}`), 30_000, async () =>
    (await get<{ candles: HistoryCandle[] }>(net, `candles?market=pool:${encodeURIComponent(poolId)}&interval=${seconds}&limit=${limit}`)).candles
  )
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
  }).catch(() => ({}))
}

export type { HistoryCandle, HistoryStats }
