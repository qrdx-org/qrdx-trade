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
