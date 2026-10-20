import { ApiError, handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { routeQuote } from '@/lib/server/routing'

export const runtime = 'edge'

/** The best route from one token to another through up to three markets (lib/server/routing.ts). */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const p = new URL(req.url).searchParams
  const from = p.get('from')
  const to = p.get('to')
  const amount = p.get('amount')
  if (!from || !to || !amount) throw new ApiError('bad_request', 'from, to and amount are required')
  return json(await routeQuote(net, from, to, amount, p.get('sender') ?? ''), 1)
})
export const OPTIONS = options
