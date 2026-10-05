import { ApiError, handler, intParam, json, options } from '@/lib/server/http'
import { perpCandles } from '@/lib/server/markets'
import { isInterval } from '@/lib/server/reference'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string; base: string; quote: string }> }) => {
  const { version, base, quote } = await params
  const net = netFromVersion(version)
  const url = new URL(req.url)
  const interval = url.searchParams.get('interval') ?? '1h'
  if (!isInterval(interval)) throw new ApiError('bad_request', 'interval must be one of 1m 5m 15m 1h 4h 1d')
  const limit = intParam(url, 'limit', 300, 1, 500)
  return json(await perpCandles(net, base, quote, interval, limit), 10)
})
export const OPTIONS = options
