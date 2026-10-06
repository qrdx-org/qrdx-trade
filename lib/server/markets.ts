/**
 * Market assembly: node pools, books, trades and accounts, oriented to the
 * pair the URL names, plus index prices for context. Every route handler is a
 * thin wrapper over a function here.
 */

import { AssetRef, VerifiedAsset, marketPath, preferredOrder, verifiedBySlug } from '../assets'
import { S, dec, mul, pctChange, str } from '../decimal'
import { bookStats, canonicalPair, isInverted, orientBook, orientPrice, withTotals } from '../pairs'
import type {
  ApiAsset,
  Candle,
  CandleSeries,
  IndexPrice,
  OrderBook,
  PerpMarket,
  PoolSummary,
  SpotMarket,
  Trade,
  TradesResponse,
} from '../types'
import { cached } from './cache'
import { ApiError, nowSec } from './http'
import { IndexedTrade, pairTrades, tapeAvailable } from './indexer'
import { HistoryCandle, HistoryStats, poolCandles, poolStats } from './history'
import { usdQuote } from './usd'
import type { Net } from './net'
import type { NodePerpMarket, NodePool } from './node'
import { IndexTicker, Interval, INTERVALS, impliedPrice, indexTicker, pairIndexCandles } from './reference'
import { TokenIndex, refForAddress, resolveSegment, tokenIndex, verifiedRef } from './resolve'

const DAY = 86_400

export function apiAsset(ref: AssetRef): ApiAsset {
  return {
    segment: ref.segment,
    slug: ref.slug,
    symbol: ref.symbol,
    name: ref.name,
    verified: ref.verified,
    address: ref.address,
    onChainSymbol: ref.onChainSymbol,
    decimals: ref.decimals,
    color: ref.color,
    listed: !!ref.address,
  }
}

const toIndex = (t: IndexTicker | null): IndexPrice | null => t && { ...t }

// ─── Shared node reads (cached) ────────────────────────────────────────────────

const allPools = (net: Net) => cached(net.key('pools'), 2_000, () => net.node.pools())
const perpList = (net: Net) => cached(net.key('perp-markets'), 2_000, () => net.node.perpMarkets())

function poolsForPair(pools: NodePool[], a: string, b: string): NodePool[] {
  const { pair } = canonicalPair(a.toLowerCase(), b.toLowerCase())
  return pools.filter((p) => canonicalPair(p.token0.toLowerCase(), p.token1.toLowerCase()).pair === pair)
}

function poolSummary(p: NodePool, inverted: boolean): PoolSummary {
  return {
    poolId: p.pool_id,
    feeTier: p.fee_tier,
    feeRate: p.fee_rate,
    tickSpacing: p.tick_spacing,
    price: orientPrice(p.price, inverted),
    liquidity: p.liquidity,
    positions: p.positions,
    paused: p.paused,
    token0: p.token0.toLowerCase(),
    token1: p.token1.toLowerCase(),
    holderAddress: p.holder_address,
  }
}

/** The pool whose price best represents the pair: most active liquidity, unpaused. */
function referencePool(pools: NodePool[]): NodePool | undefined {
  return [...pools]
    .filter((p) => !p.paused)
    .sort((x, y) => (dec(y.liquidity) > dec(x.liquidity) ? 1 : dec(y.liquidity) < dec(x.liquidity) ? -1 : 0))[0]
}

// ─── Trades & candles (shared by spot and perps) ───────────────────────────────

function orientTrade(t: IndexedTrade, inverted: boolean): Trade {
  if (!inverted) {
    return { id: t.id, time: t.time, price: t.price, size: t.size, side: t.side, venue: t.venue, txHash: t.txHash, blockHeight: t.blockHeight }
  }
  return {
    id: t.id,
    time: t.time,
    price: S.inv(t.price) ?? '0',
    size: t.quoteSize,
    side: t.side === 'buy' ? 'sell' : 'buy',
    venue: t.venue,
    txHash: t.txHash,
    blockHeight: t.blockHeight,
  }
}

/** 24 h change and volume (in quote units) from trades, oldest first. */
export function stats24h(trades: Pick<Trade, 'time' | 'price' | 'size'>[], now = nowSec()) {
  if (!trades.length) return { change24h: null, volume24h: null, last: null }
  const since = now - DAY
  const last = trades[trades.length - 1].price
  // Reference: the last trade at or before 24 h ago; else the first trade inside the window.
  let ref: string | null = null
  let volume = 0n
  for (const t of trades) {
    if (t.time <= since) ref = t.price
    else {
      if (ref === null) ref = t.price
      volume += mul(dec(t.price), dec(t.size))
    }
  }
  return {
    last,
    change24h: ref ? pctChange(ref, last) : null,
    volume24h: str(volume),
  }
}

export function buildCandles(trades: Pick<Trade, 'time' | 'price' | 'size'>[], seconds: number, limit: number): Candle[] {
  const out: Candle[] = []
  for (const t of trades) {
    const bucket = Math.floor(t.time / seconds) * seconds
    const c = out[out.length - 1]
    if (c && c.t === bucket) {
      if (dec(t.price) > dec(c.h)) c.h = t.price
      if (dec(t.price) < dec(c.l)) c.l = t.price
      c.c = t.price
      c.v = str(dec(c.v) + dec(t.size))
    } else {
      out.push({ t: bucket, o: t.price, h: t.price, l: t.price, c: t.price, v: t.size })
    }
  }
  return out.slice(-limit)
}

async function referenceSeries(
  market: string,
  base: VerifiedAsset | undefined,
  quote: VerifiedAsset | 'usd' | undefined,
  interval: Interval,
  limit: number
): Promise<CandleSeries> {
  const ref = base && quote ? await pairIndexCandles(base, quote, interval, limit).catch(() => null) : null
  if (!ref || !ref.candles.length) {
    return { market, interval, kind: 'none', exact: true, label: '', candles: [], source: null, asOf: nowSec() }
  }
  return {
    market,
    interval,
    kind: 'index',
    exact: ref.exact,
    label: `Index · ${ref.label} (${ref.source})`,
    candles: ref.candles.slice(-limit),
    source: ref.source,
    asOf: nowSec(),
  }
}

// ─── Spot ─────────────────────────────────────────────────────────────────────

interface ResolvedPair {
  base: AssetRef
  quote: AssetRef
  baseAsset?: VerifiedAsset
  quoteAsset?: VerifiedAsset
  id: string
}

export async function resolvePair(net: Net, baseSeg: string, quoteSeg: string): Promise<ResolvedPair> {
  const [b, q] = await Promise.all([resolveSegment(net, baseSeg), resolveSegment(net, quoteSeg)])
  if (b.ref.segment === q.ref.segment) throw new ApiError('bad_request', 'Base and quote are the same asset')
  return { base: b.ref, quote: q.ref, baseAsset: b.asset, quoteAsset: q.asset, id: `${b.ref.segment}/${q.ref.segment}` }
}

/** A pool's history candle in the market's orientation (base/quote, base volume). */
export function orientHistoryCandle(c: HistoryCandle, inverted: boolean): Candle {
  if (!inverted) return { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v0 }
  const inv = (x: string) => S.inv(x) ?? '0'
  return { t: c.t, o: inv(c.o), h: inv(c.l), l: inv(c.h), c: inv(c.c), v: c.v1 }
}

/** 24 h change (percent) and quote volume from a pool's recorded history. */
export function historyMarketStats(h: HistoryStats | undefined, inverted: boolean) {
  if (!h || !h.last || !h.open24h) return { change24h: null, volume24h: null }
  const last = orientPrice(h.last, inverted)
  const open = orientPrice(h.open24h, inverted)
  return {
    change24h: last && open ? pctChange(open, last) : null,
    volume24h: inverted ? h.v0_24h : h.v1_24h,
  }
}

async function spotMarketFor(
  net: Net,
  r: ResolvedPair,
  pools: NodePool[] | null,
  withBook: boolean,
  history?: Record<string, HistoryStats>
): Promise<SpotMarket> {
  const [baseIdx, quoteIdx] = await Promise.all([
    r.baseAsset ? indexTicker(r.baseAsset).catch(() => null) : null,
    r.quoteAsset ? indexTicker(r.quoteAsset).catch(() => null) : null,
  ])
  const market: SpotMarket = {
    type: 'spot',
    id: r.id,
    path: marketPath('spot', r.base.segment, r.quote.segment),
    status: 'unlisted',
    base: apiAsset(r.base),
    quote: apiAsset(r.quote),
    pair: null,
    inverted: false,
    last: null,
    lastSource: null,
    bestBid: null,
    bestAsk: null,
    mid: null,
    spread: null,
    change24h: null,
    volume24h: null,
    pools: [],
    indexPrice: impliedPrice(baseIdx, quoteIdx),
    baseUsd: await usdQuote(net, r.base.address, r.base.slug).catch(() => null),
    baseIndex: toIndex(baseIdx),
    quoteIndex: toIndex(quoteIdx),
    source: 'node',
    asOf: nowSec(),
  }
  if (!r.base.address || !r.quote.address) return market
  if (pools === null) return { ...market, status: 'node_unavailable' }

  const { pair, token0 } = canonicalPair(r.base.address, r.quote.address)
  const inverted = isInverted(r.base.address, token0)
  const pairPools = poolsForPair(pools, r.base.address, r.quote.address)
  market.pair = pair
  market.inverted = inverted
  market.pools = pairPools.map((p) => poolSummary(p, inverted))
  if (!pairPools.length) return { ...market, status: 'no_market' }
  market.status = 'live'

  const ref = referencePool(pairPools)
  const [book, tape, hist] = await Promise.all([
    withBook ? cached(net.key(`book:${pair}:1`), 1_500, () => net.node.spotBook(pair, 1)).catch(() => null) : null,
    pairTrades(net, pair).catch(() => null),
    history ?? (ref ? poolStats(net, [ref.pool_id]) : Promise.resolve({} as Record<string, HistoryStats>)),
  ])
  if (book) {
    const oriented = orientBook(book.bids, book.asks, inverted)
    market.bestBid = oriented.bids[0]?.[0] ?? null
    market.bestAsk = oriented.asks[0]?.[0] ?? null
    Object.assign(market, (({ mid, spread }) => ({ mid, spread }))(bookStats(market.bestBid, market.bestAsk)))
  }
  const trades = (tape?.trades ?? []).map((t) => orientTrade(t, inverted))
  if (trades.length) {
    // The swap tape, where the node allows reading it.
    const s = stats24h(trades)
    market.change24h = s.change24h
    market.volume24h = s.volume24h
    market.last = s.last
    market.lastSource = 'trade'
  } else {
    // Otherwise the recorded pool history (relay/ cron), and the pool's price now.
    Object.assign(market, historyMarketStats(ref ? hist[ref.pool_id] : undefined, inverted))
    market.last = ref ? orientPrice(ref.price, inverted) : null
    market.lastSource = market.last ? 'pool' : null
  }
  return market
}

export async function spotMarket(net: Net, baseSeg: string, quoteSeg: string): Promise<SpotMarket> {
  const [r, idx] = await Promise.all([resolvePair(net, baseSeg, quoteSeg), tokenIndex(net)])
  const pools = await allPools(net).catch(() => null)
  const market = await spotMarketFor(net, r, pools, true)
  // Without the token list we cannot tell "not deployed here" from "could not ask".
  return idx.nodeOk ? market : { ...market, status: 'node_unavailable' }
}

/** Every pair that has a pool, oriented by quote preference. */
export async function spotMarkets(net: Net): Promise<{ markets: SpotMarket[]; nodeOk: boolean }> {
  const [idx, pools] = await Promise.all([tokenIndex(net), allPools(net).catch(() => null)])
  if (!pools) return { markets: [], nodeOk: false }
  const pairs = new Map<string, [string, string]>()
  for (const p of pools) {
    const { pair, token0, token1 } = canonicalPair(p.token0.toLowerCase(), p.token1.toLowerCase())
    pairs.set(pair, [token0, token1])
  }
  // One history read for every pair's reference pool.
  const refs = [...pairs.keys()].map((pair) => referencePool(pools.filter((p) => canonicalPair(p.token0.toLowerCase(), p.token1.toLowerCase()).pair === pair)))
  const history = await poolStats(net, refs.filter(Boolean).map((p) => p!.pool_id))
  const markets = await Promise.all(
    [...pairs.values()].map(async ([a, b]) => {
      const [base, quote] = preferredOrder(refForAddress(a, idx), refForAddress(b, idx))
      return spotMarketFor(
        net,
        {
          base,
          quote,
          baseAsset: base.slug ? verifiedBySlug(base.slug) : undefined,
          quoteAsset: quote.slug ? verifiedBySlug(quote.slug) : undefined,
          id: `${base.segment}/${quote.segment}`,
        },
        pools,
        true,
        history
      )
    })
  )
  return { markets, nodeOk: true }
}

export async function spotBook(net: Net, baseSeg: string, quoteSeg: string, depth: number): Promise<OrderBook> {
  const r = await resolvePair(net, baseSeg, quoteSeg)
  const empty: OrderBook = {
    market: r.id,
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    mid: null,
    spread: null,
    spreadBps: null,
    source: 'node',
    asOf: nowSec(),
  }
  if (!r.base.address || !r.quote.address) return empty
  const { pair, token0 } = canonicalPair(r.base.address, r.quote.address)
  const book = await cached(net.key(`book:${pair}:${depth}`), 1_500, () => net.node.spotBook(pair, depth))
  if (!book) return empty
  const oriented = orientBook(book.bids, book.asks, isInverted(r.base.address, token0))
  const bestBid = oriented.bids[0]?.[0] ?? null
  const bestAsk = oriented.asks[0]?.[0] ?? null
  return {
    ...empty,
    ...oriented,
    bestBid,
    bestAsk,
    ...bookStats(bestBid, bestAsk),
    escrowAddress: book.escrow_address,
  }
}

export async function spotTrades(net: Net, baseSeg: string, quoteSeg: string, limit: number): Promise<TradesResponse> {
  const r = await resolvePair(net, baseSeg, quoteSeg)
  if (!r.base.address || !r.quote.address) {
    return { market: r.id, trades: [], source: 'indexer', coverage: { fromBlock: null, toBlock: null }, asOf: nowSec() }
  }
  const { pair, token0 } = canonicalPair(r.base.address, r.quote.address)
  const inverted = isInverted(r.base.address, token0)
  const { trades, coverage } = await pairTrades(net, pair)
  return {
    market: r.id,
    trades: trades.slice(-limit).reverse().map((t) => orientTrade(t, inverted)),
    source: 'indexer',
    available: tapeAvailable(net),
    coverage,
    asOf: nowSec(),
  }
}

export async function spotCandles(net: Net, baseSeg: string, quoteSeg: string, interval: Interval, limit: number): Promise<CandleSeries> {
  const r = await resolvePair(net, baseSeg, quoteSeg)
  if (r.base.address && r.quote.address) {
    const { pair, token0 } = canonicalPair(r.base.address, r.quote.address)
    const inverted = isInverted(r.base.address, token0)
    const { trades } = await pairTrades(net, pair).catch(() => ({ trades: [] as IndexedTrade[] }))
    if (trades.length) {
      return {
        market: r.id,
        interval,
        kind: 'market',
        exact: true,
        label: `${r.base.symbol}/${r.quote.symbol} · QRDX swaps`,
        candles: buildCandles(trades.map((t) => orientTrade(t, inverted)), INTERVALS[interval], limit),
        source: 'indexer',
        asOf: nowSec(),
      }
    }
    // The pool's recorded prices (relay/ cron), from the deepest pool of the pair.
    const pools = await allPools(net).catch(() => [] as NodePool[])
    const ref = referencePool(poolsForPair(pools, r.base.address, r.quote.address))
    if (ref) {
      const rows = await poolCandles(net, ref.pool_id, INTERVALS[interval], limit).catch(() => [])
      if (rows.length) {
        return {
          market: r.id,
          interval,
          kind: 'market',
          exact: true,
          label: `${r.base.symbol}/${r.quote.symbol} · pool price`,
          candles: rows.map((c) => orientHistoryCandle(c, inverted)),
          source: 'history',
          asOf: nowSec(),
        }
      }
    }
  }
  return referenceSeries(r.id, r.baseAsset, r.quoteAsset, interval, limit)
}

// ─── Perps ─────────────────────────────────────────────────────────────────────

const optNum = (s: string | null) => (s === null || s === undefined ? null : Math.floor(Number(s)))

async function perpSummary(net: Net, m: NodePerpMarket, idx: TokenIndex): Promise<PerpMarket> {
  const asset = verifiedBySlug(m.base)
  const [ticker, fills] = await Promise.all([
    asset ? indexTicker(asset).catch(() => null) : null,
    cached(net.key(`perp-trades:${m.market_id}:500`), 3_000, () => net.node.perpTrades(m.market_id, 500)).catch(() => []),
  ])
  const s = stats24h(fills.map((f) => ({ time: Math.floor(f.block_time), price: f.price, size: f.amount })))
  return {
    type: 'perp',
    id: m.market_id,
    path: marketPath('perp', m.base.toLowerCase(), m.quote.toLowerCase()),
    base: m.base,
    quote: m.quote,
    baseAsset: asset ? apiAsset(verifiedRef(asset, idx)) : null,
    markPrice: m.mark_price,
    oraclePrice: m.oracle_price,
    oracleTime: optNum(m.oracle_time),
    lastTradePrice: m.last_trade_price,
    openInterest: m.open_interest,
    bestBid: m.best_bid,
    bestAsk: m.best_ask,
    fundingRate: m.funding_rate,
    fundingTime: optNum(m.funding_time),
    nextFundingTime: optNum(m.next_funding_time),
    maxLeverage: m.max_leverage,
    maintenanceRate: m.maintenance_rate,
    change24h: s.change24h,
    volume24h: s.volume24h,
    indexPrice: ticker?.price ?? null,
    indexSource: ticker?.source ?? null,
    source: 'node',
    asOf: nowSec(),
  }
}

export async function perpMarkets(net: Net): Promise<{ markets: PerpMarket[]; nodeOk: boolean }> {
  const [idx, list] = await Promise.all([tokenIndex(net), perpList(net).catch(() => null)])
  if (!list) return { markets: [], nodeOk: false }
  return { markets: await Promise.all(list.map((m) => perpSummary(net, m, idx))), nodeOk: true }
}

async function findPerp(net: Net, baseSeg: string, quoteSeg: string): Promise<NodePerpMarket> {
  const list = await perpList(net)
  const m = list.find(
    (x) => x.base.toLowerCase() === baseSeg.toLowerCase() && x.quote.toLowerCase() === quoteSeg.toLowerCase()
  )
  if (!m) throw new ApiError('not_found', `No perpetual market ${baseSeg.toUpperCase()}-${quoteSeg.toUpperCase()}`)
  return m
}

export async function perpMarket(net: Net, baseSeg: string, quoteSeg: string): Promise<PerpMarket> {
  const [m, idx] = await Promise.all([findPerp(net, baseSeg, quoteSeg), tokenIndex(net)])
  return perpSummary(net, m, idx)
}

export async function perpBook(net: Net, baseSeg: string, quoteSeg: string, depth: number): Promise<OrderBook> {
  const m = await findPerp(net, baseSeg, quoteSeg)
  const book = await cached(net.key(`perp-book:${m.market_id}:${depth}`), 1_500, () => net.node.perpBook(m.market_id, depth))
  if (!book) throw new ApiError('not_found', `No order book for ${m.market_id}`)
  const bids = withTotals(book.bids)
  const asks = withTotals(book.asks)
  const bestBid = bids[0]?.[0] ?? null
  const bestAsk = asks[0]?.[0] ?? null
  return {
    market: m.market_id,
    bids,
    asks,
    bestBid,
    bestAsk,
    ...bookStats(bestBid, bestAsk),
    markPrice: book.mark_price,
    oraclePrice: book.oracle_price,
    source: 'node',
    asOf: nowSec(),
  }
}

export async function perpTrades(net: Net, baseSeg: string, quoteSeg: string, limit: number): Promise<TradesResponse> {
  const m = await findPerp(net, baseSeg, quoteSeg)
  const fills = await net.node.perpTrades(m.market_id, limit)
  return {
    market: m.market_id,
    trades: fills
      .slice()
      .reverse()
      .map((f) => ({
        id: `${f.seq}`,
        time: Math.floor(f.block_time),
        price: f.price,
        size: f.amount,
        side: f.buyer?.toLowerCase() === f.taker?.toLowerCase() ? 'buy' : 'sell',
        venue: 'perp',
        txHash: f.tx_hash,
        blockHeight: f.block_height,
        liquidation: f.liquidation,
      })),
    source: 'node',
    asOf: nowSec(),
  }
}

export async function perpCandles(net: Net, baseSeg: string, quoteSeg: string, interval: Interval, limit: number): Promise<CandleSeries> {
  const m = await findPerp(net, baseSeg, quoteSeg)
  const fills = await net.node.perpTrades(m.market_id, 1000).catch(() => [])
  if (fills.length) {
    return {
      market: m.market_id,
      interval,
      kind: 'market',
      exact: true,
      label: `${m.market_id} · fills`,
      candles: buildCandles(
        fills.map((f) => ({ time: Math.floor(f.block_time), price: f.price, size: f.amount })),
        INTERVALS[interval],
        limit
      ),
      source: 'node',
      asOf: nowSec(),
    }
  }
  return referenceSeries(m.market_id, verifiedBySlug(m.base), 'usd', interval, limit)
}

// ─── Pair-agnostic helpers ─────────────────────────────────────────────────────

/** The pair a bare `/trade/{base}` should open: a live market's quote, else USDC. */
export async function defaultQuote(net: Net, baseSeg: string): Promise<string> {
  const { markets } = await spotMarkets(net).catch(() => ({ markets: [] as SpotMarket[] }))
  const seg = baseSeg.toLowerCase()
  const live = markets.find((m) => m.base.segment === seg || m.base.address === seg)
  if (live) return live.quote.segment
  const asQuote = markets.find((m) => m.quote.segment === seg || m.quote.address === seg)
  if (asQuote) return asQuote.base.segment
  return seg === 'usdc' ? 'usdt' : 'usdc'
}

