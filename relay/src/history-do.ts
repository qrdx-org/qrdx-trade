/**
 * Market history storage and API (ARCHITECTURE.md §12): one SQLite Durable
 * Object per network, fed by the worker's minute cron, read by the trade API.
 *
 *   GET  /api/history/v1/{network}/candles?market=pool:<id>&interval=<seconds>&limit=
 *   GET  /api/history/v1/{network}/stats?markets=pool:<a>,pool:<b>
 *   POST /api/history/v1/{network}/sample        record now (the cron does this every minute)
 */

import { DurableObject } from 'cloudflare:workers'
import { HistoryCandle, HistoryStats, Sample, buildCandles, changed, stats24h } from './history'
import { json, type Env } from './worker'

const RETENTION_SEC = 90 * 86_400
const INTERVALS = new Set([60, 300, 900, 3600, 14_400, 86_400])
const MARKET_RE = /^pool:[0-9A-Za-z_-]{1,64}$/
const NETWORK_RE = /^[a-z][a-z0-9-]{0,31}$/

interface Row extends Sample {
  market: string
}

export class MarketHistory extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS samples (
         market TEXT NOT NULL, t INTEGER NOT NULL, price TEXT NOT NULL, v0 TEXT NOT NULL, v1 TEXT NOT NULL,
         PRIMARY KEY (market, t))`
    )
  }

  private lastAtOrBefore(market: string, t: number): Sample | undefined {
    return this.sql
      .exec<Sample & Record<string, SqlStorageValue>>('SELECT t, price, v0, v1 FROM samples WHERE market = ? AND t <= ? ORDER BY t DESC LIMIT 1', market, t)
      .toArray()[0]
  }

  private between(market: string, after: number, upTo: number): Sample[] {
    return this.sql
      .exec<Sample & Record<string, SqlStorageValue>>('SELECT t, price, v0, v1 FROM samples WHERE market = ? AND t > ? AND t <= ? ORDER BY t', market, after, upTo)
      .toArray()
  }

  private first(market: string): Sample | undefined {
    return this.sql.exec<Sample & Record<string, SqlStorageValue>>('SELECT t, price, v0, v1 FROM samples WHERE market = ? ORDER BY t LIMIT 1', market).toArray()[0]
  }

  /** Store the rows that changed. Returns how many were stored. */
  async record(rows: Row[]): Promise<number> {
    let n = 0
    for (const r of rows) {
      if (!changed(this.lastAtOrBefore(r.market, Number.MAX_SAFE_INTEGER), r)) continue
      this.sql.exec('INSERT OR REPLACE INTO samples (market, t, price, v0, v1) VALUES (?, ?, ?, ?, ?)', r.market, r.t, r.price, r.v0, r.v1)
      n++
    }
    this.sql.exec('DELETE FROM samples WHERE t < ?', Math.floor(Date.now() / 1000) - RETENTION_SEC)
    return n
  }

  async candles(market: string, seconds: number, limit: number): Promise<HistoryCandle[]> {
    const now = Math.floor(Date.now() / 1000)
    const from = Math.floor((now - limit * seconds) / seconds) * seconds
    const before = this.lastAtOrBefore(market, from)
    return buildCandles(this.between(market, from, now), before, from, now, seconds).slice(-limit)
  }

  async stats(markets: string[]): Promise<Record<string, HistoryStats>> {
    const since = Math.floor(Date.now() / 1000) - 86_400
    const out: Record<string, HistoryStats> = {}
    for (const m of markets) {
      out[m] = stats24h(this.lastAtOrBefore(m, since), this.between(m, since, Number.MAX_SAFE_INTEGER), this.first(m))
    }
    return out
  }
}

function networks(env: Env): Record<string, string> {
  try {
    return JSON.parse(env.NETWORKS || '{}')
  } catch {
    return {}
  }
}

/** Read a network's pools and record them. */
export async function sampleNetwork(env: Env, network: string, rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'exchange_getPools', params: [] }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await res.json()) as { result?: { pool_id: string; price: string; volume: [string, string] }[] }
  if (!Array.isArray(body.result)) throw new Error(`${network}: exchange_getPools failed`)
  const t = Math.floor(Date.now() / 60_000) * 60
  const rows: Row[] = body.result.map((p) => ({ market: `pool:${p.pool_id}`, t, price: p.price, v0: p.volume[0], v1: p.volume[1] }))
  return env.HISTORY.get(env.HISTORY.idFromName(network)).record(rows)
}

export async function sampleAll(env: Env): Promise<void> {
  await Promise.all(
    Object.entries(networks(env)).map(([n, url]) =>
      sampleNetwork(env, n, url).catch((e) => console.warn(`[history] ${n}: ${(e as Error).message}`))
    )
  )
}

export async function historyFetch(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const m = /\/history\/v1\/([^/]+)\/(candles|stats|sample)\/?$/.exec(url.pathname)
  if (!m) return json({ error: 'not found' }, 404)
  const [, network, action] = m
  const rpc = networks(env)[network]
  if (!NETWORK_RE.test(network) || !rpc) return json({ error: `unknown network ${network}` }, 404)
  const stub = env.HISTORY.get(env.HISTORY.idFromName(network))
  if (action === 'sample') {
    return json({ recorded: await sampleNetwork(env, network, rpc) })
  }
  if (action === 'candles') {
    const market = url.searchParams.get('market') ?? ''
    const interval = Number(url.searchParams.get('interval') ?? 3600)
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 300) || 300))
    if (!MARKET_RE.test(market)) return json({ error: 'market must be pool:<id>' }, 400)
    if (!INTERVALS.has(interval)) return json({ error: 'interval must be 60, 300, 900, 3600, 14400 or 86400' }, 400)
    return json({ market, interval, candles: await stub.candles(market, interval, limit) })
  }
  const markets = (url.searchParams.get('markets') ?? '').split(',').filter((x) => MARKET_RE.test(x)).slice(0, 200)
  return json({ stats: await stub.stats(markets) })
}
