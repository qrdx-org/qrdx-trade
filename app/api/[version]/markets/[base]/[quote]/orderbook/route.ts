import { handler, intParam, json, options } from '@/lib/server/http'
import { spotBook } from '@/lib/server/markets'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string; base: string; quote: string }> }) => {
  const { version, base, quote } = await params
  const net = netFromVersion(version)
  const depth = intParam(new URL(req.url), 'depth', 20, 1, 500)
  return json(await spotBook(net, base, quote, depth), 1)
})
export const OPTIONS = options
