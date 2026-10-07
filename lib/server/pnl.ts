/**
 * An account's trading PnL, rebuilt from the node's market data (PERPS_API.md §8–9).
 *
 *   perps   every fill the account was in (perp_getEvents), with the PnL the clearinghouse
 *           realized on it, in collateral units; open positions' unrealized PnL at mark.
 *   spot    the account's fills on each spot market (market_getTrades rows where it was the
 *           maker or the taker: book fills and pool swaps), on an average-cost basis per
 *           market in its quote token: selling realizes (price − average cost) × amount;
 *           what is still held is marked at the market's last price.
 *
 * Bounded by what the node keeps: the newest 1000 trades per market and 1000 perps events.
 * Sells of inventory bought before that window (or received by transfer) have no known
 * cost and realize nothing. USD values use today's prices (index or pool route), labelled.
 */

import { isNativeAsset, marketPath, preferredOrder } from '../assets'
import { Dec, abs, dec, div, mul, str } from '../decimal'
import type { PnlMarket, PnlResponse } from '../types'
import { cached } from './cache'
import { nowSec } from './http'
import { nodeTickers, nodeTrades } from './market-data'
import type { Net } from './net'
import type { NodeMarketTrade } from './node'
import { refForAddress, tokenIndex } from './resolve'
import { UsdQuote, usdQuotes } from './usd'
import { mapLimit } from './util'

const TRADE_WINDOW = 1000
const EVENT_WINDOW = 1000

interface Realization {
  time: number
  /** USD, null when the market's quote token has no USD price. */
  usd: Dec | null
}

interface SpotBook {
  pos: Dec
  cost: Dec
  realized: Dec
  volume: Dec
  trades: number
  wins: number
  losses: number
  events: Realization[]
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
  const realizations: Realization[] = []
  let truncated = false

  // ── spot ────────────────────────────────────────────────────────────
  const spot = [...(tickers?.values() ?? [])].filter((t) => t.type === 'spot')
  const rows = await mapLimit(spot, 6, async (t) => ({ t, trades: (await nodeTrades(net, t.market, TRADE_WINDOW)) ?? [] }))
  for (const { t, trades } of rows) {
    if (trades.length >= TRADE_WINDOW) truncated = true
    const mine = trades.filter((r) => isMine(r, me)).sort((a, b) => a.seq - b.seq)
    if (!mine.length) continue
    const quoteUsd = usdOf(t.quote)
    const book = replaySpot(mine, me, quoteUsd)
    const last = t.last_price ? dec(t.last_price) : null
    const unrealized = last !== null && book.pos > 0n ? mul(book.pos, last) - book.cost : 0n
    const [b, q] = [refForAddress(t.base, idx), refForAddress(t.quote, idx)]
    const [dBase, dQuote] = preferredOrder(b, q)
    realizations.push(...book.events)
    markets.push({
      kind: 'spot',
      market: `${dBase.symbol}/${dQuote.symbol}`,
      path: marketPath('spot', dBase.segment, dQuote.segment),
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
      avgCost: book.pos > 0n ? str(div(book.cost, book.pos)) : null,
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
    if (pnl !== 0n) realizations.push({ time: f.block_time, usd: collateralUsd === null ? null : mul(pnl, collateralUsd) })
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
    })
  }

  // ── totals and the cumulative series ────────────────────────────────
  const sum = (xs: (string | null)[]) => xs.reduce((s, x) => s + (x === null ? 0n : dec(x)), 0n)
  const realizedUsd = sum(markets.map((m) => m.realizedUsd))
  const unrealizedUsd = sum(markets.map((m) => m.unrealizedUsd))
  const series: PnlResponse['series'] = []
  let running = 0n
  for (const r of realizations.filter((r) => r.usd !== null).sort((a, b) => a.time - b.time)) {
    running += r.usd!
    const time = Math.floor(r.time)
    if (series.length && series[series.length - 1].time === time) series[series.length - 1].realizedUsd = str(running)
    else series.push({ time, realizedUsd: str(running) })
  }
  const trades = markets.reduce((s, m) => s + m.trades, 0)
  const wins = markets.reduce((s, m) => s + m.wins, 0)
  const losses = markets.reduce((s, m) => s + m.losses, 0)
  const first = [...realizations.map((r) => r.time)].sort((a, b) => a - b)[0] ?? null

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

/** Average-cost replay of one market's fills (oldest first), in its quote token. */
export function replaySpot(fills: NodeMarketTrade[], me: string, quoteUsd: Dec | null): SpotBook {
  const b: SpotBook = { pos: 0n, cost: 0n, realized: 0n, volume: 0n, trades: 0, wins: 0, losses: 0, events: [] }
  for (const f of fills) {
    const asTaker = (f.taker ?? '').toLowerCase() === me
    const side = asTaker ? f.side : f.side === 'buy' ? 'sell' : 'buy'
    const price = dec(f.price)
    const amount = dec(f.amount)
    if (price <= 0n || amount <= 0n) continue
    b.trades += 1
    b.volume += mul(price, amount)
    if (side === 'buy') {
      b.pos += amount
      b.cost += mul(price, amount)
      continue
    }
    // A sell closes what this window bought; anything beyond has no known cost.
    const closing = amount < b.pos ? amount : b.pos
    if (closing <= 0n) continue
    const avg = div(b.cost, b.pos)
    const pnl = mul(closing, price - avg)
    b.realized += pnl
    b.cost -= mul(avg, closing)
    b.pos -= closing
    if (b.pos === 0n) b.cost = 0n
    if (pnl > 0n) b.wins += 1
    if (pnl < 0n) b.losses += 1
    b.events.push({ time: f.block_time, usd: quoteUsd === null ? null : mul(pnl, quoteUsd) })
  }
  return b
}

