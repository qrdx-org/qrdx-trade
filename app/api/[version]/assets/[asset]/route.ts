import { handler, json, nowSec, options } from '@/lib/server/http'
import { apiAsset } from '@/lib/server/markets'
import { indexTicker } from '@/lib/server/reference'
import { resolveSegment, tokenIndex } from '@/lib/server/resolve'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; asset: string }> }) => {
  const { version, asset } = await params
  const net = netFromVersion(version)
  const r = await resolveSegment(net, asset)
  const index = r.asset ? await indexTicker(r.asset).catch(() => null) : null
  const t = r.token
  // What the creator says about the token: signed by them, not checked by anyone.
  const claimed = r.ref.address && !r.asset ? (await tokenIndex(net)).profiles.get(r.ref.address) : undefined
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
      profile: claimed ? { ...claimed.profile, signer: claimed.signer, updatedAt: claimed.updatedAt } : null,
      source: 'node',
      asOf: nowSec(),
    },
    10
  )
})
export const OPTIONS = options
