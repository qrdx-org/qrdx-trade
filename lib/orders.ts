/** Order parameters in the node's terms. Pure; shared by the order form and tests. */

import { dec, div, divUp, mul, str } from './decimal'
import type { SpotMarket } from './types'

type Side = 'buy' | 'sell'

/**
 * The order to sign, in the node's terms. The node's book is keyed by the sorted
 * pair: side and amount refer to token0 and price is token1 per token0. When the
 * URL's base is token1 (`market.inverted`), a buy of the base is a sell of
 * token0 at the inverse price, sized in token0.
 */
export function spotLimitParams(market: Pick<SpotMarket, 'base' | 'quote' | 'inverted'>, side: Side, priceStr: string, sizeStr: string) {
  const base = market.base.address!
  const quote = market.quote.address!
  if (!market.inverted) {
    return { pair: `${base}:${quote}`, side, order_type: 'limit', price: priceStr, amount: sizeStr }
  }
  // 1/P is rarely exact at 18 places. Round it so the order is never worse than the
  // user's limit: buying the base is a node-side SELL of token0 (a minimum price,
  // so round up); selling the base is a node-side BUY (a maximum price, round down).
  const p = dec(priceStr)
  const one = dec('1')
  return {
    pair: `${quote}:${base}`,
    side: side === 'buy' ? 'sell' : 'buy',
    order_type: 'limit',
    price: str(side === 'buy' ? divUp(one, p) : div(one, p)),
    amount: str(mul(dec(sizeStr), p)),
  }
}

/**
 * The market an open spot order rests on, as spotLimitParams needs it: the account API shows
 * orders in the market's orientation (base/quote), and the node's pair names token0 first, so
 * the market is inverted when token0 is not the base.
 */
export function orderMarket(o: { pair: string; base: SpotMarket['base']; quote: SpotMarket['quote'] }): Pick<SpotMarket, 'base' | 'quote' | 'inverted'> {
  const token0 = o.pair.split(':')[0]?.toLowerCase() ?? ''
  return { base: o.base, quote: o.quote, inverted: token0 !== (o.base.address ?? '').toLowerCase() }
}

// ─── Trigger orders and TWAPs (qrdx-node docs/TRADING_FEATURES.md) ──────────────

export type SpotTriggerKind = 'stop_loss' | 'take_profit'

/**
 * A spot stop-loss / take-profit in the node's terms (PLACE_ORDER with `order_type`). It is
 * judged on the pair's last trade (token1 per token0) and escrowed when placed. On an inverted
 * market the side flips and the prices invert; the kind does not: a stop still fires as the
 * price moves against the order, whichever token it is named in. Without `limit` it fires as
 * a market order at most 10 % through the trigger.
 */
export function spotTriggerParams(
  market: Pick<SpotMarket, 'base' | 'quote' | 'inverted'>,
  side: Side,
  kind: SpotTriggerKind,
  trigger: string,
  sizeStr: string,
  limit?: string
) {
  const base = market.base.address!
  const quote = market.quote.address!
  if (!market.inverted) {
    return { pair: `${base}:${quote}`, side, order_type: kind, trigger_price: trigger, amount: sizeStr, ...(limit ? { price: limit } : {}) }
  }
  const one = dec('1')
  const at = dec(limit || trigger)
  return {
    pair: `${quote}:${base}`,
    side: side === 'buy' ? 'sell' : 'buy',
    order_type: kind,
    trigger_price: str(div(one, dec(trigger))),
    // Sized in token0 (this market's quote) at the limit, or the trigger without one.
    amount: str(mul(dec(sizeStr), at)),
    ...(limit ? { price: str(side === 'buy' ? divUp(one, dec(limit)) : div(one, dec(limit))) } : {}),
  }
}

/**
 * A perp trigger's kind from where it sits against the mark: a buy above the mark and a sell
 * below it are stops (they fire as the price moves against a position); the others take profit.
 */
export function perpTriggerKind(side: Side, trigger: string, mark: string): 'sl' | 'tp' {
  const above = dec(trigger) > dec(mark)
  return (side === 'buy') === above ? 'sl' : 'tp'
}

/** Whether a TP or SL for a position of this direction sits on the right side of the mark. */
export function protectiveLegError(long: boolean, leg: 'tp' | 'sl', trigger: string, mark: string): string | null {
  if (!/^\d*\.?\d+$/.test(trigger) || dec(trigger) <= 0n) return `Enter the ${leg === 'tp' ? 'take-profit' : 'stop-loss'} price.`
  const above = dec(trigger) > dec(mark)
  const wantAbove = long === (leg === 'tp')
  if (above !== wantAbove || dec(trigger) === dec(mark)) {
    return `A ${long ? 'long' : 'short'}'s ${leg === 'tp' ? 'take profit' : 'stop loss'} goes ${wantAbove ? 'above' : 'below'} the mark.`
  }
  return null
}

/** Gas a trigger prepays: 40,000 plus 10,000 for each resting order it may match when it fires. */
export const triggerGas = (maxMakers = 20) => 40_000 + maxMakers * 10_000

/** A TWAP's slices (one every 30 s, at most 60) and the gas it prepays (docs §7). */
export function twapPlan(durationSec: number, maxMakers = 5) {
  const slices = Math.max(1, Math.min(60, Math.floor(durationSec / 30)))
  return { slices, gas: 40_000 + slices * (10_000 + maxMakers * 10_000) }
}
