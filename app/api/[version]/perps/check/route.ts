import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { oracleCheck } from '@/lib/server/perp-oracle'

export const runtime = 'edge'

/**
 * Before creating a perp market: does it exist already, and can validators price
 * its base? `GET /perps/check?base=SOL` (docs/API.md "Perpetuals").
 */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const base = (new URL(req.url).searchParams.get('base') ?? '').trim()
  if (!/^[A-Za-z0-9]{1,12}$/.test(base)) throw new ApiError('bad_request', 'base must be 1 to 12 letters or digits, like SOL')
  const markets = await net.node.perpMarkets().catch(() => null)
  // Validators price markets quoted in the node's PERP_QUOTE; the existing markets show which that is.
  const quote = markets?.[0]?.quote ?? 'USD'
  const marketId = `${base}-${quote}-PERP`
  const existing = markets?.find((m) => m.market_id === marketId || (m.base.toLowerCase() === base.toLowerCase() && m.quote === quote))
  return json(
    {
      base,
      quote,
      marketId,
      exists: !!existing,
      path: `/perps/${base.toLowerCase()}/${quote.toLowerCase()}`,
      nodeOk: markets !== null,
      oracle: await oracleCheck(base),
      asOf: nowSec(),
    },
    10
  )
})
export const OPTIONS = options
