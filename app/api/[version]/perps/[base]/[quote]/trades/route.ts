import { handler, intParam, json, options } from '@/lib/server/http'
import { perpTrades } from '@/lib/server/markets'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string; base: string; quote: string }> }) => {
  const { version, base, quote } = await params
  const net = netFromVersion(version)
  const limit = intParam(new URL(req.url), 'limit', 50, 1, 500)
  return json(await perpTrades(net, base, quote, limit), 2)
})
export const OPTIONS = options
