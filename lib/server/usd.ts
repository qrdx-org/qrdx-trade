/**
 * USD prices for every token on a network, including launched coins with no
 * outside market (docs/API.md "Prices").
 *
 * Anchors are verified assets with a USD index price from public exchanges
 * (BTC, ETH, USDC, …). Every other token is priced through the network's pools,
 * by the fewest hops to an anchor: e.g. a memecoin → QRDX → BTC → Coinbase BTC-USD.
 * Among routes of equal length, stablecoin anchors win, then deeper pools.
 *
 * The 24 h change of a routed price is the product of each hop's 24 h change
 * (from the recorded pool history) and the anchor's own 24 h change, so it is
 * exactly the change of the routed price. It is null when any hop lacks a day
 * of history.
 */

import { VERIFIED_ASSETS, verifiedBySlug } from '../assets'
import { Dec, dec, div, mul, round, str } from '../decimal'
import type { IndexPrice } from '../types'
import { cached } from './cache'
import { HistoryStats, poolStats } from './history'
import type { Net } from './net'
import type { NodePool } from './node'
import { indexTickers } from './reference'
import { TokenIndex, refForAddress, tokenIndex } from './resolve'
import { nowSec } from './http'

export interface UsdQuote extends IndexPrice {
  /** Segments from the token to the anchor whose USD price was used (empty for anchors). */
  route: string[]
  /** Pools along the route. */
  pools: string[]
}

const ONE = dec('1')

interface Edge {
  pool: NodePool
  other: string
  /** Units of `other` per one of this token, now and 24 h ago (null = no history). */
  rate: Dec
  rate24h: Dec | null
}

function edges(pools: NodePool[], history: Record<string, HistoryStats>): Map<string, Edge[]> {
  const out = new Map<string, Edge[]>()
  const add = (from: string, e: Edge) => out.set(from, [...(out.get(from) ?? []), e])
  for (const p of pools) {
    const price = dec(p.price) // token1 per token0
    if (p.paused || price <= 0n || (p.positions ?? 0) === 0) continue
    const open = history[p.pool_id]?.open24h
    const price24h = open ? dec(open) : null
    const t0 = p.token0.toLowerCase()
    const t1 = p.token1.toLowerCase()
    add(t0, { pool: p, other: t1, rate: price, rate24h: price24h && price24h > 0n ? price24h : null })
    add(t1, { pool: p, other: t0, rate: div(ONE, price), rate24h: price24h && price24h > 0n ? div(ONE, price24h) : null })
  }
  // Deeper pools first, so BFS prefers them among routes of equal length.
  for (const list of out.values()) list.sort((a, b) => (dec(b.pool.liquidity) > dec(a.pool.liquidity) ? 1 : dec(b.pool.liquidity) < dec(a.pool.liquidity) ? -1 : b.pool.positions - a.pool.positions))
  return out
}

/** USD quotes for every token address priced on this network (anchors and routed). */
export function usdQuotes(net: Net): Promise<Map<string, UsdQuote>> {
  return cached(net.key('usd-quotes'), 15_000, async () => {
    const [idx, pools] = await Promise.all([
      tokenIndex(net),
      cached(net.key('pools'), 2_000, () => net.node.pools()).catch(() => [] as NodePool[]),
    ])
    const [tickers, history] = await Promise.all([
      indexTickers(VERIFIED_ASSETS),
      poolStats(net, pools.map((p) => p.pool_id)),
    ])
    return route(idx, pools, history, tickers)
  })
}

export function route(
  idx: TokenIndex,
  pools: NodePool[],
  history: Record<string, HistoryStats>,
  tickers: Record<string, IndexPrice | null>
): Map<string, UsdQuote> {
  const quotes = new Map<string, UsdQuote>()
  /** Ratio of the price now to 24 h ago; null when unknown. */
  const ratio = new Map<string, Dec | null>()
  const segment = (a: string) => refForAddress(a, idx).segment

  // Anchors: verified assets with a USD index price and a token here; stablecoins first.
  const anchors = VERIFIED_ASSETS.filter((a) => tickers[a.slug] && idx.verified.get(a.slug)).sort(
    (a, b) => Number(!!b.usdStable) - Number(!!a.usdStable) || b.quoteRank - a.quoteRank
  )
  const queue: string[] = []
  for (const a of anchors) {
    const addr = idx.verified.get(a.slug)!.token_address.toLowerCase()
    const t = tickers[a.slug]!
    quotes.set(addr, { ...t, route: [], pools: [] })
    ratio.set(addr, t.change24h === null ? null : div(dec(t.change24h) + dec('100'), dec('100')))
    queue.push(addr)
  }

  const graph = edges(pools, history)
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    const q = quotes.get(cur)!
    const r = ratio.get(cur) ?? null
    for (const e of graph.get(cur) ?? []) {
      // e is cur → other; the neighbour prices off cur by the inverse rate.
      const n = e.other
      if (quotes.has(n)) continue
      const perCur = div(ONE, e.rate) // cur per one `n`
      const per24h = e.rate24h ? div(ONE, e.rate24h) : null
      const usd = mul(perCur, dec(q.price))
      if (usd <= 0n) continue
      const hop = per24h && per24h > 0n ? div(perCur, per24h) : null
      const nr = r !== null && hop !== null ? mul(r, hop) : null
      quotes.set(n, {
        price: str(usd),
        change24h: nr === null ? null : round(str((nr - ONE) * 100n), 2),
        high24h: null,
        low24h: null,
        volume24h: null,
        source: 'route',
        asOf: nowSec(),
        route: [segment(n), ...(q.route.length ? q.route : [segment(cur)])],
        pools: [e.pool.pool_id, ...q.pools],
      })
      ratio.set(n, nr)
      queue.push(n)
    }
  }
  return quotes
}

/** One asset's USD quote: its index price when it has one, else a pool route. */
export async function usdQuote(net: Net, address: string | null, slug: string | null): Promise<UsdQuote | null> {
  if (slug) {
    const asset = verifiedBySlug(slug)
    const t = asset ? (await indexTickers([asset]))[asset.slug] : null
    if (t) return { ...t, route: [], pools: [] }
  }
  if (!address) return null
  return (await usdQuotes(net)).get(address.toLowerCase()) ?? null
}
