import { handler, intParam, json, options } from '@/lib/server/http'
import { launches } from '@/lib/server/launches'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

/** The newest community tokens and the markets they trade on. */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const limit = intParam(new URL(req.url), 'limit', 50, 1, 200)
  return json(await launches(net, limit), 5)
})
export const OPTIONS = options
