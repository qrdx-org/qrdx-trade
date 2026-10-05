import { handler, json, options } from '@/lib/server/http'
import { defaultQuote } from '@/lib/server/markets'
import { netFromVersion } from '@/lib/server/net'
import { resolveSegment } from '@/lib/server/resolve'

export const runtime = 'edge'

/** The pair `/trade/{base}` opens: a live market's quote for this base, else USDC. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; base: string }> }) => {
  const { version, base } = await params
  const net = netFromVersion(version)
  // Same rules as a pair URL: a verified token's address redirects to its slug, a bare
  // symbol of an unverified token is ambiguous.
  const seg = (await resolveSegment(net, base)).ref.segment
  const quote = await defaultQuote(net, seg)
  return json({ base: seg, quote, path: `/trade/${seg}/${quote}` }, 10)
})
export const OPTIONS = options
