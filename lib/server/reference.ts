/**
 * Reference (index) prices for verified assets, from public exchanges.
 *
 * This is labelled reference data: it is what the wider market pays for BTC,
 * not what the QRDX book will fill at. Sources are tried in order and the
 * response names the one that answered:
 *
 *   tickers: Coinbase Exchange → Kraken → CoinGecko
 *   candles: Coinbase Exchange → Kraken
 *
 * Binance is deliberately absent: it answers HTTP 451 from US edge locations.
 */

import type { VerifiedAsset } from '../assets'
import { dec, div, pctChange, str } from '../decimal'
import { cached } from './cache'

export type PriceSource = 'coinbase' | 'kraken' | 'coingecko'

export interface IndexTicker {
  price: string
  /** Rolling 24 h change in percent; null when the source has no rolling open. */
  change24h: string | null
  high24h: string | null
  low24h: string | null
  /** 24 h volume in units of the asset. */
  volume24h: string | null
  source: PriceSource
  asOf: number
}

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
export const INTERVALS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}
export const isInterval = (s: string): s is Interval => s in INTERVALS

export interface Candle {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

const TIMEOUT_MS = 5_000
const now = () => Math.floor(Date.now() / 1000)

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'qrdx-trade/1.0 (+https://trade.qrdx.org)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Numbers from JSON → decimal strings without exponent noise. */
const num = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.abs(v) < 1e-6 && v !== 0 ? v.toFixed(18).replace(/0+$/, '') : String(v)
  }
  throw new Error(`Not a number: ${String(v)}`)
}

// ─── Tickers ───────────────────────────────────────────────────────────────────

async function coinbaseTicker(product: string): Promise<IndexTicker> {
  const s = await getJson<{ open: string; high: string; low: string; last: string; volume: string }>(
    `https://api.exchange.coinbase.com/products/${product}/stats`
  )
  return {
    price: s.last,
    change24h: pctChange(s.open, s.last),
    high24h: s.high,
    low24h: s.low,
    volume24h: s.volume,
    source: 'coinbase',
    asOf: now(),
  }
}

async function krakenTicker(pair: string): Promise<IndexTicker> {
  const body = await getJson<{
    error: string[]
    result: Record<string, { c: [string, string]; h: [string, string]; l: [string, string]; v: [string, string] }>
  }>(`https://api.kraken.com/0/public/Ticker?pair=${pair}`)
  if (body.error?.length) throw new Error(`kraken: ${body.error.join(', ')}`)
  const t = Object.values(body.result)[0]
  if (!t) throw new Error(`kraken: no ticker for ${pair}`)
  return {
    price: t.c[0],
    // Kraken's `o` is today's UTC open, not a rolling 24 h open; do not pass it off as one.
    change24h: null,
    high24h: t.h[1],
    low24h: t.l[1],
    volume24h: t.v[1],
    source: 'kraken',
    asOf: now(),
  }
}

async function coingeckoTickers(ids: string[]): Promise<Record<string, IndexTicker>> {
  if (!ids.length) return {}
  const body = await getJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`
  )
  const out: Record<string, IndexTicker> = {}
  for (const id of ids) {
    const p = body[id]
    if (p?.usd === undefined) continue
    out[id] = {
      price: num(p.usd),
      change24h: p.usd_24h_change === undefined ? null : p.usd_24h_change.toFixed(2),
      high24h: null,
      low24h: null,
      volume24h: null,
      source: 'coingecko',
      asOf: now(),
    }
  }
  return out
}

async function tickerUncached(asset: VerifiedAsset): Promise<IndexTicker | null> {
  const { coinbase, kraken, coingecko } = asset.prices
  if (coinbase) {
    try {
      return await coinbaseTicker(coinbase)
    } catch (e) {
      console.warn(`[prices] coinbase ${coinbase}: ${(e as Error).message}`)
    }
  }
  if (kraken) {
    try {
      return await krakenTicker(kraken)
    } catch (e) {
      console.warn(`[prices] kraken ${kraken}: ${(e as Error).message}`)
    }
  }
  if (coingecko) {
    try {
      return (await coingeckoTickers([coingecko]))[coingecko] ?? null
    } catch (e) {
      console.warn(`[prices] coingecko ${coingecko}: ${(e as Error).message}`)
    }
  }
  return null
}

/** The asset's USD index ticker, or null when no source lists it (or all failed). */
export function indexTicker(asset: VerifiedAsset): Promise<IndexTicker | null> {
  if (!asset.prices.coinbase && !asset.prices.kraken && !asset.prices.coingecko) {
    return Promise.resolve(null)
  }
  return cached(`ticker:${asset.slug}`, 15_000, () => tickerUncached(asset))
}

export async function indexTickers(assets: VerifiedAsset[]): Promise<Record<string, IndexTicker | null>> {
  const entries = await Promise.all(assets.map(async (a) => [a.slug, await indexTicker(a)] as const))
  return Object.fromEntries(entries)
}

/** base/quote implied by two USD index prices. */
export function impliedPrice(base: IndexTicker | null, quote: IndexTicker | null): string | null {
  if (!base || !quote || dec(quote.price) === 0n) return null
  return str(div(dec(base.price), dec(quote.price)))
}

// ─── Candles ───────────────────────────────────────────────────────────────────

const COINBASE_GRANULARITY: Partial<Record<Interval, number>> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86400,
}
const KRAKEN_INTERVAL: Record<Interval, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
}

async function coinbaseCandles(product: string, interval: Interval, limit: number): Promise<Candle[]> {
  // 4h is not a Coinbase granularity: build it from 1h.
  const native = COINBASE_GRANULARITY[interval]
  const gran = native ?? 3600
  const factor = native ? 1 : INTERVALS[interval] / 3600
  const count = Math.min(300, limit * factor)
  const end = now()
  const start = end - count * gran
  const rows = await getJson<[number, number, number, number, number, number][]>(
    `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${gran}` +
      `&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`
  )
  const candles = rows
    .map(([t, low, high, open, close, volume]) => ({
      t,
      o: num(open),
      h: num(high),
      l: num(low),
      c: num(close),
      v: num(volume),
    }))
    .sort((a, b) => a.t - b.t)
  return factor === 1 ? candles : aggregate(candles, INTERVALS[interval])
}

async function krakenCandles(pair: string, interval: Interval, limit: number): Promise<Candle[]> {
  const since = now() - limit * INTERVALS[interval]
  const body = await getJson<{ error: string[]; result: Record<string, unknown> }>(
    `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${KRAKEN_INTERVAL[interval]}&since=${since}`
  )
  if (body.error?.length) throw new Error(`kraken: ${body.error.join(', ')}`)
  const key = Object.keys(body.result).find((k) => k !== 'last')
  const rows = (key ? body.result[key] : []) as [number, string, string, string, string, string, string, number][]
  return rows.map(([t, o, h, l, c, , v]) => ({ t, o, h, l, c, v }))
}

/** Merge consecutive candles into `seconds`-wide buckets aligned to the epoch. */
export function aggregate(candles: Candle[], seconds: number): Candle[] {
  const out: Candle[] = []
  for (const c of candles) {
    const t = Math.floor(c.t / seconds) * seconds
    const last = out[out.length - 1]
    if (last && last.t === t) {
      if (dec(c.h) > dec(last.h)) last.h = c.h
      if (dec(c.l) < dec(last.l)) last.l = c.l
      last.c = c.c
      last.v = str(dec(last.v) + dec(c.v))
    } else {
      out.push({ ...c, t })
    }
  }
  return out
}

export async function indexCandles(
  asset: VerifiedAsset,
  interval: Interval,
  limit = 300
): Promise<{ candles: Candle[]; source: PriceSource } | null> {
  const ttl = interval === '1m' ? 20_000 : 60_000
  return cached(`candles:${asset.slug}:${interval}:${limit}`, ttl, async () => {
    const { coinbase, kraken } = asset.prices
    if (coinbase) {
      try {
        return { candles: await coinbaseCandles(coinbase, interval, limit), source: 'coinbase' as const }
      } catch (e) {
        console.warn(`[candles] coinbase ${coinbase}: ${(e as Error).message}`)
      }
    }
    if (kraken) {
      try {
        return { candles: await krakenCandles(kraken, interval, limit), source: 'kraken' as const }
      } catch (e) {
        console.warn(`[candles] kraken ${kraken}: ${(e as Error).message}`)
      }
    }
    return null
  })
}

/**
 * Reference candles for a pair from USD series:
 *  - quote is a USD stablecoin → the base's USD candles as they are;
 *  - base is a USD stablecoin  → the quote's USD candles inverted;
 *  - otherwise                 → base/quote ratio of the two series, aligned by time.
 *    The ratio's open and close are exact; its high and low are not knowable from
 *    two independent series, so they are max/min(open, close) and `exact` is false.
 */
export async function pairIndexCandles(
  base: VerifiedAsset,
  quote: VerifiedAsset | 'usd',
  interval: Interval,
  limit = 300
): Promise<{ candles: Candle[]; source: PriceSource; exact: boolean; label: string } | null> {
  if (quote === 'usd' || quote.usdStable) {
    const s = await indexCandles(base, interval, limit)
    return s && { ...s, exact: true, label: `${base.symbol}-USD` }
  }
  const ONE = dec('1')
  const inv = (x: string) => str(div(ONE, dec(x)))
  if (base.usdStable) {
    const s = await indexCandles(quote, interval, limit)
    return (
      s && {
        source: s.source,
        exact: true,
        label: `USD-${quote.symbol}`,
        candles: s.candles
          .filter((c) => dec(c.l) > 0n)
          .map((c) => ({ t: c.t, o: inv(c.o), h: inv(c.l), l: inv(c.h), c: inv(c.c), v: '0' })),
      }
    )
  }
  const [b, q] = await Promise.all([indexCandles(base, interval, limit), indexCandles(quote, interval, limit)])
  if (!b || !q) return null
  const qByT = new Map(q.candles.map((c) => [c.t, c]))
  const candles: Candle[] = []
  for (const bc of b.candles) {
    const qc = qByT.get(bc.t)
    if (!qc || dec(qc.o) === 0n || dec(qc.c) === 0n) continue
    const o = str(div(dec(bc.o), dec(qc.o)))
    const c = str(div(dec(bc.c), dec(qc.c)))
    const [lo, hi] = dec(o) < dec(c) ? [o, c] : [c, o]
    candles.push({ t: bc.t, o, h: hi, l: lo, c, v: '0' })
  }
  return { candles, source: b.source, exact: false, label: `${base.symbol}-USD / ${quote.symbol}-USD` }
}
