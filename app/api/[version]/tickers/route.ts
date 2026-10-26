import { cached } from '@/lib/server/cache'
import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

/**
 * The unique-ticker auction (TICKER_CLAIM): what a ticker costs now, falling to its floor
 * after a sale doubles it, and the tickers reserved for verified assets.
 */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const a = await cached(net.key('ticker-auction'), 5_000, () => net.node.tickerAuction())
  if (!a) throw new ApiError('not_implemented', "This network's node has no unique tickers (qrdx-node's 2026-10 release adds them)")
  return json(
    {
      price: a.price,
      floor: a.floor,
      openingPrice: a.opening_price,
      auctionSeconds: a.auction_seconds,
      lastSale: a.last_sale ? { price: a.last_sale.price, time: Number(a.last_sale.time) } : null,
      claimed: a.tickers,
      reserved: a.reserved,
      source: 'node',
      asOf: nowSec(),
    },
    5
  )
})
export const OPTIONS = options
