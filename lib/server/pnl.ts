/**
 * An account's trading PnL, rebuilt from the node's market data (PERPS_API.md §8–9).
 *
 *   perps   every fill the account was in (perp_getEvents), with the PnL the clearinghouse
 *           realized on it, in collateral units; open positions' unrealized PnL at mark.
 *   spot    the account's own trades (history_getTrades: book fills and pool swaps; on a node
 *           without the trading history, the markets' recent trades it was in), each market
 *           replayed as the site shows it (QRDX/USDC, not the node's USDC:QRDX) on a signed
 *           average-cost basis in its quote token, like a perps position: buying adds to the
 *           position, selling reduces it and realizes (price − average cost) × amount, and
 *           selling more than was bought here (coins held from before, or received) opens a
 *           short against holding them, realized when bought back. What is open is marked at
 *           the market's pool price now (its last trade without a pool).
 *
 * The series steps at every spot trade and perps realization: realized PnL so far plus each spot
 * market's open PnL marked at its latest trade then. USD values use today's prices (index or pool
 * route), labelled.
 */

import { isNativeAsset, marketPath, preferredOrder } from '../assets'
import { Dec, abs, dec, div, mul, str } from '../decimal'
import { isInverted } from '../pairs'
import type { PnlMarket, PnlResponse, PnlTrade } from '../types'
import { cached } from './cache'
import { nowSec } from './http'
import { nodeTickers, nodeTrades } from './market-data'
import type { Net } from './net'
import type { NodeHistoryTrade, NodeMarketTrade } from './node'
import { refForAddress, tokenIndex } from './resolve'
import { UsdQuote, usdQuotes } from './usd'
import { mapLimit } from './util'

const ONE = dec('1')
const TRADE_WINDOW = 1000
const EVENT_WINDOW = 1000
/** history_getTrades pages (its MAX_PAGE) read per account: 5,000 trades. */
const HISTORY_PAGE = 500
const HISTORY_PAGES = 10
/** Trades returned for the chart's markers, newest. */
const MARKER_TRADES = 300

/** One of the account's spot trades as the node keys it: the canonical pair, the account's side. */
interface RawFill {
  time: number
  /** token0:token1 */
  market: string
  side: 'buy' | 'sell'
  /** token1 per token0 */
  price: string
  /** token0 */
  amount: string
}

/** A trade as the site shows its market: base / quote. */
export interface SpotFill {
  time: number
  side: 'buy' | 'sell'
  price: Dec
  amount: Dec
}

/** Something that moves the PnL line: a realization (USD), and for spot the market's open PnL after it. */
interface Event {
  time: number
  /** USD; null when the quote token has no USD price. */
  usd: Dec | null
  /** Spot: the market and its open PnL in USD after this trade, marked at its price. */
  market?: string
  openUsd?: Dec | null
}

export interface SpotBook {
  /** Signed: negative when more was sold than bought. */
  pos: Dec
  /** Signed, in quote: what the open position cost (negative: what selling it brought in). */
  cost: Dec
  realized: Dec
  volume: Dec
  trades: number
  wins: number
  losses: number
  /** After each trade: the PnL it realized and the open PnL marked at its price (quote). */
  steps: { time: number; realized: Dec; open: Dec }[]
}

export function accountPnl(net: Net, address: string): Promise<PnlResponse> {
  return cached(net.key(`pnl:${address.toLowerCase()}`), 10_000, () => build(net, address))
}

async function build(net: Net, address: string): Promise<PnlResponse> {
  const me = address.toLowerCase()
  const [idx, tickers, usd, perp, perpFills] = await Promise.all([
    tokenIndex(net),
    nodeTickers(net),
    usdQuotes(net).catch(() => new Map<string, UsdQuote>()),
    net.node.perpAccount(address).catch(() => null),
    net.node.perpFills(address, EVENT_WINDOW).catch(() => null),
  ])
  const usdOf = (asset: string): Dec | null => {
    const q = usd.get(isNativeAsset(asset) ? 'qrdx' : asset.toLowerCase())
    return q ? dec(q.price) : null
  }

  const markets: PnlMarket[] = []
  const events: Event[] = []
  let truncated = false

  // ── spot ────────────────────────────────────────────────────────────
  const history = await spotHistory(net, address)
  let raw: RawFill[]
  if (history) {
    raw = history.rows
    if (history.truncated) truncated = true
  } else {
    // A node without the trading history: the account's fills among each market's recent trades.
    const spot = [...(tickers?.values() ?? [])].filter((t) => t.type === 'spot')
    const rows = await mapLimit(spot, 6, async (t) => (await nodeTrades(net, t.market, TRADE_WINDOW)) ?? [])
    if (rows.some((r) => r.length >= TRADE_WINDOW)) truncated = true
    raw = rows.flat().filter((r) => isMine(r, me)).map((r) => fromMarketTrade(r, me))
  }
  const byMarket = new Map<string, RawFill[]>()
  for (const f of raw) byMarket.set(f.market.toLowerCase(), [...(byMarket.get(f.market.toLowerCase()) ?? []), f])
  const tradeMarks: PnlTrade[] = []
  for (const [key, fills] of byMarket) {
    const [t0, t1] = key.split(':')
    const [b, q] = preferredOrder(refForAddress(t0, idx), refForAddress(t1, idx))
    const inverted = isInverted(b.address!, t0)
    const shown = fills.sort((x, y) => x.time - y.time).map((f) => orientFill(f, inverted))
    const quoteUsd = usdOf(q.address!)
    const book = replaySpot(shown)
    const ticker = tickers?.get(key) ?? null
    // The pool's price now when the market has one (its last trade may be long ago), else the last trade.
    const live = ticker?.amm_price || ticker?.last_price
    const tickerLast = live ? dec(live) : null
    const last = tickerLast !== null && tickerLast > 0n ? (inverted ? div(ONE, tickerLast) : tickerLast) : shown[shown.length - 1].price
    const unrealized = mul(book.pos, last) - book.cost
    const name = `${b.symbol}/${q.symbol}`
    const toUsd = (x: Dec) => (quoteUsd === null ? null : mul(x, quoteUsd))
    for (const st of book.steps) events.push({ time: st.time, usd: toUsd(st.realized), market: key, openUsd: toUsd(st.open) })
    for (const f of shown) tradeMarks.push({ time: Math.floor(f.time), market: name, side: f.side, amount: str(f.amount), price: str(f.price), base: b.symbol, quote: q.symbol })
    markets.push({
      kind: 'spot',
      market: name,
      path: marketPath('spot', b.segment, q.segment),
      unit: q.symbol,
      trades: book.trades,
      wins: book.wins,
      losses: book.losses,
      volume: str(book.volume),
      volumeUsd: quoteUsd === null ? null : str(mul(book.volume, quoteUsd)),
      realized: str(book.realized),
      realizedUsd: quoteUsd === null ? null : str(mul(book.realized, quoteUsd)),
      unrealized: str(unrealized),
      unrealizedUsd: quoteUsd === null ? null : str(mul(unrealized, quoteUsd)),
      position: str(book.pos),
      positionSymbol: b.symbol,
      avgCost: book.pos !== 0n ? str(div(book.cost, book.pos)) : null,
      last: str(last),
    })
  }

  // ── perps ───────────────────────────────────────────────────────────
  const collateral = perp?.collateral_token || 'QRDX'
  const collateralSymbol = refForAddress(collateral, idx).symbol
  const collateralUsd = usdOf(collateral)
  const fills = perpFills?.events ?? []
  if (fills.length >= EVENT_WINDOW) truncated = true
  const perMarket = new Map<string, { realized: Dec; volume: Dec; trades: number; wins: number; losses: number }>()
  for (const f of fills) {
    const entry = Object.entries<string>(f.realized ?? {}).find(([who]) => who.toLowerCase() === me)
    const pnl = entry ? dec(entry[1]) : 0n
    const m = perMarket.get(f.market) ?? { realized: 0n, volume: 0n, trades: 0, wins: 0, losses: 0 }
    m.realized += pnl
    m.volume += mul(dec(f.amount), dec(f.price))
    m.trades += 1
    if (pnl > 0n) m.wins += 1
    if (pnl < 0n) m.losses += 1
    perMarket.set(f.market, m)
    if (pnl !== 0n) events.push({ time: f.block_time, usd: collateralUsd === null ? null : mul(pnl, collateralUsd) })
  }
  const positions = perp?.positions ?? {}
  for (const id of new Set([...perMarket.keys(), ...Object.keys(positions)])) {
    const m = perMarket.get(id) ?? { realized: 0n, volume: 0n, trades: 0, wins: 0, losses: 0 }
    const p = positions[id]
    const unrealized = p ? dec(p.unrealized_pnl) : 0n
    const [base, quote] = id.split('-')
    markets.push({
      kind: 'perp',
      market: id,
      path: marketPath('perp', (base ?? id).toLowerCase(), (quote ?? 'usd').toLowerCase()),
      unit: collateralSymbol,
      trades: m.trades,
      wins: m.wins,
      losses: m.losses,
      volume: str(m.volume),
      volumeUsd: collateralUsd === null ? null : str(mul(m.volume, collateralUsd)),
      realized: str(m.realized),
      realizedUsd: collateralUsd === null ? null : str(mul(m.realized, collateralUsd)),
      unrealized: str(unrealized),
      unrealizedUsd: collateralUsd === null ? null : str(mul(unrealized, collateralUsd)),
      position: p ? p.size : '0',
      positionSymbol: base ?? id,
      avgCost: p ? p.entry_price : null,
      last: p ? p.mark_price : null,
    })
  }

  // ── totals and the cumulative series ────────────────────────────────
  const sum = (xs: (string | null)[]) => xs.reduce((s, x) => s + (x === null ? 0n : dec(x)), 0n)
  const realizedUsd = sum(markets.map((m) => m.realizedUsd))
  const unrealizedUsd = sum(markets.map((m) => m.unrealizedUsd))
  // Realized so far plus every spot market's open PnL as its latest trade marked it.
  const series: PnlResponse['series'] = []
  let realizedSoFar = 0n
  const open = new Map<string, Dec>()
  for (const e of events.sort((x, y) => x.time - y.time)) {
    if (e.usd === null && (e.openUsd ?? null) === null) continue
    realizedSoFar += e.usd ?? 0n
    if (e.market && e.openUsd !== undefined && e.openUsd !== null) open.set(e.market, e.openUsd)
    const openSum = [...open.values()].reduce((s, x) => s + x, 0n)
    const time = Math.floor(e.time)
    const point = { time, realizedUsd: str(realizedSoFar), pnlUsd: str(realizedSoFar + openSum) }
    if (series.length && series[series.length - 1].time === time) series[series.length - 1] = point
    else series.push(point)
  }
  const trades = markets.reduce((s, m) => s + m.trades, 0)
  const wins = markets.reduce((s, m) => s + m.wins, 0)
  const losses = markets.reduce((s, m) => s + m.losses, 0)
  const first = series[0]?.time ?? null

  markets.sort((a, b) => Number(abs(dec(b.realizedUsd ?? '0')) + abs(dec(b.unrealizedUsd ?? '0')) - abs(dec(a.realizedUsd ?? '0')) - abs(dec(a.unrealizedUsd ?? '0'))) || b.trades - a.trades)

  return {
    address,
    totals: {
      realizedUsd: str(realizedUsd),
      unrealizedUsd: str(unrealizedUsd),
      pnlUsd: str(realizedUsd + unrealizedUsd),
      volumeUsd: str(sum(markets.map((m) => m.volumeUsd))),
      trades,
      wins,
      losses,
      unpriced: markets.filter((m) => m.realizedUsd === null).map((m) => m.market),
    },
    series,
    trades: tradeMarks.sort((a, b) => a.time - b.time).slice(-MARKER_TRADES),
    markets,
    perpUnit: collateralSymbol,
    window: { from: first, truncated },
    source: 'node',
    asOf: nowSec(),
  }
}

const isMine = (r: NodeMarketTrade, me: string) => {
  const maker = (r.maker ?? '').toLowerCase()
  const taker = (r.taker ?? '').toLowerCase()
  // A self-trade moves nothing.
  return (maker === me) !== (taker === me)
}

/** The account's spot trades from the trading history, newest pages first; null on a node without it. */
async function spotHistory(net: Net, address: string): Promise<{ rows: RawFill[]; truncated: boolean } | null> {
  const me = address.toLowerCase()
  const rows: RawFill[] = []
  let cursor: string | null = null
  for (let i = 0; i < HISTORY_PAGES; i++) {
    const page = await net.node.historyTrades({ address, limit: HISTORY_PAGE, cursor }).catch(() => null)
    if (!page) return i === 0 ? null : { rows, truncated: true }
    for (const t of page.items) {
      const f = fromHistoryTrade(t, me)
      if (f) rows.push(f)
    }
    if (!page.next_cursor) return { rows, truncated: false }
    cursor = page.next_cursor
  }
  return { rows, truncated: true }
}

/** A history row as the account's spot fill; null for perps rows and self-trades. */
export function fromHistoryTrade(t: NodeHistoryTrade, me: string): RawFill | null {
  if (!t.market.includes(':')) return null
  const buyer = (t.buyer ?? '').toLowerCase() === me
  const seller = (t.seller ?? '').toLowerCase() === me
  if (buyer === seller) return null
  return { time: t.block_time, market: t.market, side: buyer ? 'buy' : 'sell', price: t.price, amount: t.amount }
}

function fromMarketTrade(r: NodeMarketTrade, me: string): RawFill {
  // market_getTrades gives the taker's side.
  const asTaker = (r.taker ?? '').toLowerCase() === me
  return { time: r.block_time, market: r.market, side: asTaker ? r.side : r.side === 'buy' ? 'sell' : 'buy', price: r.price, amount: r.amount }
}

/**
 * A canonical fill as the site shows the market. Inverted (the shown base is token1): buying
 * token0 at p is selling p·a of the base at 1/p.
 */
export function orientFill(f: Pick<RawFill, 'time' | 'side' | 'price' | 'amount'>, inverted: boolean): SpotFill {
  const price = dec(f.price)
  const amount = dec(f.amount)
  if (!inverted || price <= 0n) return { time: f.time, side: f.side, price, amount }
  return { time: f.time, side: f.side === 'buy' ? 'sell' : 'buy', price: div(ONE, price), amount: mul(amount, price) }
}

/** Signed average-cost replay of one market's trades (oldest first), in its quote token. */
export function replaySpot(fills: SpotFill[]): SpotBook {
  const b: SpotBook = { pos: 0n, cost: 0n, realized: 0n, volume: 0n, trades: 0, wins: 0, losses: 0, steps: [] }
  for (const f of fills) {
    if (f.price <= 0n || f.amount <= 0n) continue
    b.trades += 1
    b.volume += mul(f.price, f.amount)
    const delta = f.side === 'buy' ? f.amount : -f.amount
    let realized = 0n
    if (b.pos === 0n || (b.pos > 0n) === (delta > 0n)) {
      // Opens or adds to the position.
      b.pos += delta
      b.cost += mul(f.price, delta)
    } else {
      // Reduces it: realizes against the average cost; whatever is left over opens the other way.
      const held = abs(b.pos)
      const closing = f.amount < held ? f.amount : held
      const avg = div(b.cost, b.pos)
      const dir = b.pos > 0n ? 1n : -1n
      realized = mul(closing, f.price - avg) * dir
      b.cost -= mul(avg, closing) * dir
      b.pos -= closing * dir
      if (b.pos === 0n) b.cost = 0n
      const rest = f.amount - closing
      if (rest > 0n) {
        b.pos = rest * -dir
        b.cost = mul(f.price, b.pos)
      }
      b.realized += realized
      if (realized > 0n) b.wins += 1
      if (realized < 0n) b.losses += 1
    }
    b.steps.push({ time: f.time, realized, open: mul(b.pos, f.price) - b.cost })
  }
  return b
}
