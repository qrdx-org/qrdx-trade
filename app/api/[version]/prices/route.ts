import { VERIFIED_ASSETS, verifiedBySlug } from '@/lib/assets'
import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { indexTickers } from '@/lib/server/reference'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  netFromVersion((await params).version) // index prices are network-independent; still reject unknown versions
  const raw = new URL(req.url).searchParams.get('assets')
  const slugs = raw ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : VERIFIED_ASSETS.map((a) => a.slug)
  const assets = slugs.map((s) => {
    const a = verifiedBySlug(s)
    if (!a) throw new ApiError('not_found', `"${s}" is not a verified asset`)
    return a
  })
  return json({ prices: await indexTickers(assets), asOf: nowSec() }, 10)
})
export const OPTIONS = options
