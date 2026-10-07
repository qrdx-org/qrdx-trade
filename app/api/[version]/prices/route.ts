import { VERIFIED_ASSETS, isTokenAddress } from '@/lib/assets'
import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { refForAddress, resolveSegment, tokenIndex } from '@/lib/server/resolve'
import { usdQuote } from '@/lib/server/usd'

export const runtime = 'edge'

/**
 * USD prices: verified assets from public exchanges (index), anything else through
 * the network's pools to one of them (route). ?assets= takes slugs or token addresses.
 */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const raw = new URL(req.url).searchParams.get('assets')
  const segments = raw ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : VERIFIED_ASSETS.map((a) => a.slug)
  if (segments.length > 100) throw new ApiError('bad_request', 'At most 100 assets per request')
  const entries = await Promise.all(
    segments.map(async (seg) => {
      try {
        // A verified asset's token address prices like its slug (resolveSegment would redirect it).
        const verified = isTokenAddress(seg) ? (await tokenIndex(net)).slugByAddress.has(seg) : false
        const ref = verified ? refForAddress(seg, await tokenIndex(net)) : (await resolveSegment(net, seg)).ref
        return [seg, await usdQuote(net, ref.address, ref.slug)] as const
      } catch {
        return [seg, null] as const
      }
    })
  )
  return json({ prices: Object.fromEntries(entries), asOf: nowSec() }, 10)
})
export const OPTIONS = options
