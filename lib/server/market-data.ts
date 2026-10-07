/**
 * The node's own market data (qrdx-node docs/PERPS_API.md §8): tickers, trades
 * and OHLCV candles built from the blocks, for every spot pair (order-book fills
 * and pool swaps) and perps market. Prices are quote per base of the node's
 * canonical pair; these helpers orient them to a URL's pair.
 *
 * Nodes from before these methods answer "method not found": every reader here
 * returns null then, and the callers fall back to the indexer, the history
 * worker and the reference index (ARCHITECTURE.md §1).
 */

import { S, dec, str } from '../decimal'
import type { Candle, Trade } from '../types'
import { cached } from './cache'
import type { Net } from './net'
import type { NodeMarketCandle, NodeMarketTrade, NodeTicker } from './node'

/** The node writes market data with up to 78 decimal places; clients get 18, like every node amount. */
const n18 = (x: string) => str(dec(x))

/** Market names compared the node's way: QRDX in any casing, addresses lower-case. */
export const marketKey = (m: string) => m.toLowerCase()

/** Every market's ticker, by market key; null when the node has no market data. */
export function nodeTickers(net: Net): Promise<Map<string, NodeTicker> | null> {
  return cached(net.key('market-tickers'), 4_000, async () => {
    const list = await net.node.marketTickers()
    return new Map(list.map((t) => [marketKey(t.market), t]))
  }).catch(() => null)
}

export async function nodeTicker(net: Net, market: string): Promise<NodeTicker | null> {
  return (await nodeTickers(net))?.get(marketKey(market)) ?? null
}

/** A ticker's 24 h figures as a URL's pair reads them; null when it had no trade in 24 h. */
export function tickerStats(t: NodeTicker | null, inverted: boolean): { last: string | null; change24h: string | null; volume24h: string } | null {
  if (!t || !t.trades_24h || !t.last_price) return null
  const last = inverted ? S.inv(n18(t.last_price)) : n18(t.last_price)
  let change24h: string | null = null
  if (t.open_24h && dec(t.open_24h) > 0n) {
    const open = Number(t.open_24h)
    const now = Number(t.last_price)
    // Inverting both ends inverts the ratio: 1/now ÷ 1/open = open/now.
    const ratio = inverted ? open / now : now / open
    change24h = ((ratio - 1) * 100).toFixed(2)
  }
  return { last, change24h, volume24h: n18(inverted ? t.volume_24h : t.quote_volume_24h) }
}

export async function nodeTrades(net: Net, market: string, limit: number): Promise<NodeMarketTrade[] | null> {
  return cached(net.key(`market-trades:${marketKey(market)}:${limit}`), 2_000, async () => (await net.node.marketTrades(market, limit))?.trades ?? []).catch(
    () => null
  )
}

/** A trade as the URL's pair reads it: price inverted, size in its base, the taker's side flipped. */
export function orientNodeTrade(t: NodeMarketTrade, inverted: boolean): Trade {
  return {
    id: `${t.seq}`,
    time: Math.floor(t.block_time),
    price: inverted ? (S.inv(n18(t.price)) ?? n18(t.price)) : n18(t.price),
    size: n18(inverted ? t.quote_amount : t.amount),
    side: inverted ? (t.side === 'buy' ? 'sell' : 'buy') : t.side,
    venue: t.venue,
    txHash: t.tx_hash,
    blockHeight: t.block_height,
  }
}

export async function nodeCandles(net: Net, market: string, interval: string, limit: number): Promise<NodeMarketCandle[] | null> {
  return cached(net.key(`market-candles:${marketKey(market)}:${interval}:${limit}`), 5_000, async () =>
    (await net.node.marketCandles(market, interval, limit))?.candles ?? []
  ).catch(() => null)
}

/**
 * Candles in the URL's orientation, continuous: the node lists only intervals
 * with trades, so a quiet interval repeats the last close with no volume (the
 * price did not move: nothing traded). Volume is in the URL's base.
 */
export function orientNodeCandles(rows: NodeMarketCandle[], inverted: boolean, seconds: number, limit: number, now: number): Candle[] {
  if (!rows.length) return []
  const inv = (x: string) => S.inv(n18(x)) ?? n18(x)
  const oriented: Candle[] = rows.map((r) =>
    inverted
      ? { t: r.time, o: inv(r.open), h: inv(r.low), l: inv(r.high), c: inv(r.close), v: n18(r.quote_volume) }
      : { t: r.time, o: n18(r.open), h: n18(r.high), l: n18(r.low), c: n18(r.close), v: n18(r.volume) }
  )
  const out: Candle[] = []
  const end = Math.floor(now / seconds) * seconds
  let i = 0
  let prev: Candle | null = null
  for (let t = oriented[0].t; t <= end; t += seconds) {
    if (i < oriented.length && oriented[i].t === t) {
      prev = oriented[i++]
      out.push(prev)
    } else if (prev) {
      out.push({ t, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: str(0n) })
    }
    // Skip node rows that are not on this interval's grid (none expected).
    while (i < oriented.length && oriented[i].t < t) i++
  }
  return out.slice(-limit)
}
