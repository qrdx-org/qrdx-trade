import { handler, json, nowSec, options } from '@/lib/server/http'
import { apiAsset } from '@/lib/server/markets'
import { indexTicker } from '@/lib/server/reference'
import { resolveSegment } from '@/lib/server/resolve'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; asset: string }> }) => {
  const { version, asset } = await params
  const net = netFromVersion(version)
  const r = await resolveSegment(net, asset)
  const index = r.asset ? await indexTicker(r.asset).catch(() => null) : null
  const t = r.token
  return json(
    {
      ...apiAsset(r.ref),
      token: t
        ? {
            totalSupply: t.total_supply,
            maxSupply: t.max_supply,
            creator: t.creator,
            mintAuthority: t.mint_authority,
            freezeAuthority: t.freeze_authority,
            createdHeight: t.created_height,
          }
        : null,
      index,
      source: 'node',
      asOf: nowSec(),
    },
    10
  )
})
export const OPTIONS = options
