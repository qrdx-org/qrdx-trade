import { handler, json, nowSec, options } from '@/lib/server/http'
import { perpMarkets, spotMarkets } from '@/lib/server/markets'
import type { MarketsResponse } from '@/lib/types'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const [spot, perps] = await Promise.all([spotMarkets(net), perpMarkets(net)])
  const body: MarketsResponse = {
    spot: spot.markets,
    perps: perps.markets,
    nodeOk: spot.nodeOk && perps.nodeOk,
    source: 'node',
    asOf: nowSec(),
  }
  return json(body, 2)
})
export const OPTIONS = options
