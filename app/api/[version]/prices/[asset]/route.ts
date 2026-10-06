import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { apiAsset } from '@/lib/server/markets'
import { netFromVersion } from '@/lib/server/net'
import { resolveSegment } from '@/lib/server/resolve'
import { usdQuote } from '@/lib/server/usd'

export const runtime = 'edge'

/** One asset's USD price (index or pool route). 404 when nothing prices it. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; asset: string }> }) => {
  const { version, asset } = await params
  const net = netFromVersion(version)
  const { ref } = await resolveSegment(net, asset)
  const quote = await usdQuote(net, ref.address, ref.slug)
  if (!quote) throw new ApiError('not_found', `No USD price for ${ref.symbol}: no public price, and no pool route to an asset that has one`)
  return json({ asset: apiAsset(ref), ...quote, asOf: nowSec() }, 10)
})
export const OPTIONS = options
