/**
 * Orientation between the node's canonical pair and the pair in the URL.
 *
 * The node keys every spot pool and book by the SORTED token pair
 * (`token0:token1`, token0 the lower address string — state_manager
 * `_canonical_pair`). A book's base is token0 and its prices are token1 per
 * token0; a pool's price is token1 per token0 too.
 *
 * The URL decides what the user calls base and quote. When the URL's base is the
 * node's token1 the pair is "inverted", and every price and level is flipped:
 *
 *   canonical bid  (price p, size a token0) — someone pays p·a token1 for a token0
 *   inverted view  — they sell p·a of the URL's base (token1) for a of its quote
 *                   → an ASK at 1/p for size p·a
 *
 * Pure functions; shared by the API and tests.
 */

import { S, dec, div, mul, str } from './decimal'

export type Level = [price: string, size: string]
export type LevelWithTotal = [price: string, size: string, total: string]

export function canonicalPair(a: string, b: string): { pair: string; token0: string; token1: string } {
  // Python's `a > b` on str compares code points, which is what `<` does on JS strings.
  const [token0, token1] = a > b ? [b, a] : [a, b]
  return { pair: `${token0}:${token1}`, token0, token1 }
}

/** Is the URL base the node's token1? (Addresses compared case-insensitively.) */
export function isInverted(baseAddress: string, token0: string): boolean {
  return baseAddress.toLowerCase() !== token0.toLowerCase()
}

/** A price as the URL orients it. */
export function orientPrice(price: string | null | undefined, inverted: boolean): string | null {
  if (price === null || price === undefined) return null
  if (!inverted) return price
  return S.inv(price)
}

/**
 * Re-orient a canonical book. Returns levels best-first with a running total of
 * size, in the URL's base units.
 */
export function orientBook(
  bids: Level[],
  asks: Level[],
  inverted: boolean
): { bids: LevelWithTotal[]; asks: LevelWithTotal[] } {
  if (!inverted) return { bids: withTotals(bids), asks: withTotals(asks) }
  const ONE = dec('1')
  const flip = (levels: Level[]): Level[] =>
    levels
      .filter(([p]) => dec(p) > 0n)
      .map(([p, a]) => [str(div(ONE, dec(p))), str(mul(dec(p), dec(a)))])
  // Canonical bids become inverted asks and vice versa. Best canonical bid (highest
  // p) is the lowest 1/p, so best-first order is preserved.
  return { bids: withTotals(flip(asks)), asks: withTotals(flip(bids)) }
}

export function withTotals(levels: Level[]): LevelWithTotal[] {
  let total = 0n
  return levels.map(([p, s]) => {
    total += dec(s)
    return [p, s, str(total)]
  })
}

/** Spread, mid, and spread in basis points from best bid / ask. */
export function bookStats(bestBid: string | null, bestAsk: string | null) {
  if (!bestBid || !bestAsk) return { mid: null, spread: null, spreadBps: null }
  const b = dec(bestBid)
  const a = dec(bestAsk)
  const mid = (a + b) / 2n
  const spread = a - b
  const spreadBps = mid > 0n ? str(div(spread * 10_000n, mid)) : null
  return {
    mid: str(mid),
    spread: str(spread),
    spreadBps: spreadBps === null ? null : Number(spreadBps).toFixed(2),
  }
}
