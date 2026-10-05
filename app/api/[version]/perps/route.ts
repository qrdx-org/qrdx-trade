import { handler, json, nowSec, options } from '@/lib/server/http'
import { perpMarkets } from '@/lib/server/markets'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const { markets, nodeOk } = await perpMarkets(net)
  return json({ perps: markets, nodeOk, source: 'node', asOf: nowSec() }, 2)
})
export const OPTIONS = options
