/**
 * Can validators price a new perp market? (docs/ARCHITECTURE.md §13)
 *
 * A perp market trades once the validator committee votes its oracle price.
 * Validators running the `exchanges` feed (qrdx-node validator/price_feed.py)
 * take the median USD spot price of the market's base from public exchanges,
 * pricing a bridged "qBTC"-style base as its underlying. This asks the same
 * public endpoints, so the create form can say before anything is signed
 * whether the market will get a price. It is a preview of the validators'
 * input, not the oracle itself.
 */

import { cached } from './cache'

export interface OracleSource {
  source: 'coinbase' | 'kraken'
  price: string
}

export interface OracleCheck {
  /** The symbol the feed looks up (qBTC → BTC). */
  underlying: string
  /** Median of the sources that answered, or null when none did. */
  price: string | null
  sources: OracleSource[]
}

/** qBTC → BTC: a bridged asset is priced as what it bridges (price_feed.underlying). */
export function underlying(base: string): string {
  return base.length > 1 && base[0] === 'q' && base.slice(1) === base.slice(1).toUpperCase() && /[A-Z]/.test(base.slice(1))
    ? base.slice(1)
    : base
}

const positive = (v: unknown): string | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? String(v) : null
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4_000), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const SOURCES: { source: OracleSource['source']; url: (s: string) => string; read: (j: unknown) => unknown }[] = [
  {
    source: 'coinbase',
    url: (s) => `https://api.coinbase.com/v2/prices/${encodeURIComponent(s)}-USD/spot`,
    read: (j) => (j as { data?: { amount?: string } }).data?.amount,
  },
  {
    source: 'kraken',
    url: (s) => `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(s)}USD`,
    read: (j) => {
      const r = (j as { result?: Record<string, { c?: string[] }> }).result
      return r ? Object.values(r)[0]?.c?.[0] : undefined
    },
  },
]

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function oracleCheck(base: string): Promise<OracleCheck> {
  const sym = underlying(base)
  return cached(`perp-oracle:${sym}`, 30_000, async () => {
    const got = await Promise.all(
      SOURCES.map(async (s) => {
        try {
          const p = positive(s.read(await getJson(s.url(sym))))
          return p ? { source: s.source, price: p } : null
        } catch {
          return null
        }
      })
    )
    const sources = got.filter((x): x is OracleSource => x !== null)
    return {
      underlying: sym,
      price: sources.length ? String(median(sources.map((s) => Number(s.price)))) : null,
      sources,
    }
  })
}
