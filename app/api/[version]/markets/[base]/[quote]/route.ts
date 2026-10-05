import { handler, json, options } from '@/lib/server/http'
import { spotMarket } from '@/lib/server/markets'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; base: string; quote: string }> }) => {
  const { version, base, quote } = await params
  const net = netFromVersion(version)
  return json(await spotMarket(net, base, quote), 2)
})
export const OPTIONS = options
