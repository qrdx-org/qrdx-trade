/**
 * Smart routing: the best way from one token to another through up to MAX_HOPS markets.
 *
 * The node's SWAP fills one pair (the best of that pair's pools and order book), so a route
 * A → B → C → D is several SWAPs. Every market that can fill a swap is an edge: a pool with
 * liquidity, or a spot book with resting orders. Paths up to MAX_HOPS edges are enumerated
 * (shortest first, at most MAX_PATHS), each is quoted hop by hop with the node's own quote
 * (each hop's input is the previous hop's output), and the one that delivers the most wins.
 * The direct pair is one of the candidates, so a route is only longer when it pays more.
 *
 * Nothing here is estimated: every amount is the node's quote for that hop at the tip.
 */

import { dec, div, mul, str } from '../decimal'
import type { ApiAsset } from '../types'
import { cached } from './cache'
import { ApiError, nowSec } from './http'
import { apiAsset } from './markets'
import { nodeTickers } from './market-data'
import type { Net } from './net'
import type { NodeSwapQuote } from './node'
import { refForAddress, resolveSegment, tokenIndex } from './resolve'

const MAX_HOPS = 3
const MAX_PATHS = 12

export interface RouteHop {
  from: ApiAsset
  to: ApiAsset
  amountIn: string
  amountOut: string
  fee: string
  /** amm or clob, as the node chose for this pair. */
  venue: string
  poolId: string | null
  priceImpact: string | null
}

export interface RoutedQuote {
  from: ApiAsset
  to: ApiAsset
  amountIn: string
  amountOut: string
  /** `from` paid per `to` received, over the whole route. */
  executionPrice: string
  /** 1 − Π(1 − each hop's impact), when every hop reports one. */
  priceImpact: string | null
  hops: RouteHop[]
  /** The direct pair's output, for comparison; null when the pair has no market. */
  directAmountOut: string | null
  pathsConsidered: number
  source: 'node'
  asOf: number
}

const norm = (a: string) => (a.toUpperCase() === 'QRDX' ? 'QRDX' : a.toLowerCase())

/** Which tokens trade directly with which: pools with liquidity and books with orders. */
async function graph(net: Net): Promise<Map<string, Set<string>>> {
  return cached(net.key('route-graph'), 5_000, async () => {
    const [pools, tickers] = await Promise.all([net.node.pools().catch(() => []), nodeTickers(net)])
    const g = new Map<string, Set<string>>()
    const link = (a: string, b: string) => {
      const [x, y] = [norm(a), norm(b)]
      if (x === y) return
      if (!g.has(x)) g.set(x, new Set())
      if (!g.has(y)) g.set(y, new Set())
      g.get(x)!.add(y)
      g.get(y)!.add(x)
    }
    for (const p of pools) if (dec(p.liquidity || '0') > 0n) link(p.token0, p.token1)
    for (const t of tickers?.values() ?? []) if (t.type === 'spot' && (t.best_bid || t.best_ask)) link(t.base, t.quote)
    return g
  })
}

/** Simple paths from `a` to `b` of at most MAX_HOPS edges, shortest first. */
export function paths(g: Map<string, Set<string>>, a: string, b: string, maxHops = MAX_HOPS, limit = MAX_PATHS): string[][] {
  const out: string[][] = []
  let frontier: string[][] = [[a]]
  for (let depth = 0; depth < maxHops && out.length < limit; depth++) {
    const next: string[][] = []
    for (const path of frontier) {
      for (const n of g.get(path[path.length - 1]) ?? []) {
        if (path.includes(n)) continue
        const p = [...path, n]
        if (n === b) out.push(p)
        else next.push(p)
      }
    }
    frontier = next
  }
  return out.slice(0, limit)
}

async function quotePath(net: Net, path: string[], amount: string, sender: string): Promise<{ quotes: NodeSwapQuote[]; out: string } | null> {
  const quotes: NodeSwapQuote[] = []
  let inAmount = amount
  for (let i = 0; i < path.length - 1; i++) {
    const q = await net.node.quoteSwap(path[i], path[i + 1], inAmount, sender).catch(() => null)
    // A hop that cannot take everything it is given would strand the rest mid-route.
    if (!q || dec(q.amount_out) <= 0n || dec(q.unfilled_in || '0') > 0n) return null
    quotes.push(q)
    inAmount = q.amount_out
  }
  return { quotes, out: inAmount }
}

export async function routeQuote(net: Net, fromSeg: string, toSeg: string, amount: string, sender: string): Promise<RoutedQuote> {
  if (!/^\d+(\.\d+)?$/.test(amount) || dec(amount) <= 0n) throw new ApiError('bad_request', 'amount must be a positive decimal')
  const [from, to] = await Promise.all([resolveSegment(net, fromSeg), resolveSegment(net, toSeg)])
  if (!from.ref.address || !to.ref.address) throw new ApiError('not_found', `${!from.ref.address ? from.ref.symbol : to.ref.symbol} has no token on this network yet`)
  const [a, b] = [norm(from.ref.address), norm(to.ref.address)]
  const candidates = paths(await graph(net), a, b)
  if (!candidates.length) throw new ApiError('not_found', `No route from ${from.ref.symbol} to ${to.ref.symbol} within ${MAX_HOPS} markets`)

  const quoted = await Promise.all(candidates.map(async (p) => ({ path: p, q: await quotePath(net, p, amount, sender) })))
  const ok = quoted.filter((x): x is { path: string[]; q: { quotes: NodeSwapQuote[]; out: string } } => !!x.q)
  if (!ok.length) throw new ApiError('not_found', 'No route can fill this amount right now')
  // Most output first; among equals, fewer hops (fewer fees and signatures).
  ok.sort((x, y) => (dec(y.q.out) > dec(x.q.out) ? 1 : dec(y.q.out) < dec(x.q.out) ? -1 : x.path.length - y.path.length))
  const best = ok[0]
  const direct = ok.find((x) => x.path.length === 2)

  const idx = await tokenIndex(net)
  const asset = (addr: string) => (norm(addr) === a ? apiAsset(from.ref) : norm(addr) === b ? apiAsset(to.ref) : apiAsset(refForAddress(addr, idx)))
  const hops: RouteHop[] = best.q.quotes.map((q, i) => ({
    from: asset(best.path[i]),
    to: asset(best.path[i + 1]),
    amountIn: q.amount_in,
    amountOut: q.amount_out,
    fee: q.fee,
    venue: q.source,
    poolId: q.pool_id,
    priceImpact: q.price_impact ?? null,
  }))
  const impacts = hops.map((h) => h.priceImpact)
  const priceImpact = impacts.every((x) => x != null)
    ? str(dec('1') - impacts.reduce((acc, x) => mul(acc, dec('1') - dec(x!)), dec('1')))
    : null
  return {
    from: apiAsset(from.ref),
    to: apiAsset(to.ref),
    amountIn: amount,
    amountOut: best.q.out,
    executionPrice: str(div(dec(amount), dec(best.q.out))),
    priceImpact,
    hops,
    directAmountOut: direct ? direct.q.out : null,
    pathsConsidered: candidates.length,
    source: 'node',
    asOf: nowSec(),
  }
}
