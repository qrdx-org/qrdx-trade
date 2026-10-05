import { ApiError, handler, json, options } from '@/lib/server/http'
import { pools } from '@/lib/server/accounts'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const url = new URL(req.url)
  const base = url.searchParams.get('base') ?? undefined
  const quote = url.searchParams.get('quote') ?? undefined
  if (!!base !== !!quote) throw new ApiError('bad_request', 'Give both base and quote, or neither')
  return json(await pools(net, base, quote), 2)
})
export const OPTIONS = options
