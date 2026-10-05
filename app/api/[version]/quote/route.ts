import { ApiError, handler, json, options } from '@/lib/server/http'
import { swapQuote } from '@/lib/server/accounts'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const p = new URL(req.url).searchParams
  const from = p.get('from')
  const to = p.get('to')
  const amount = p.get('amount')
  if (!from || !to || !amount) throw new ApiError('bad_request', 'from, to and amount are required')
  const quote = await swapQuote(net, from, to, amount, p.get('sender') ?? '', p.get('venue') ?? 'auto', p.get('pool') ?? undefined)
  return json(quote, 1)
})
export const OPTIONS = options
