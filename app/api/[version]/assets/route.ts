import { VERIFIED_ASSETS } from '@/lib/assets'
import { handler, json, nowSec, options } from '@/lib/server/http'
import { apiAsset } from '@/lib/server/markets'
import { tokenIndex, unverifiedRef, verifiedRef } from '@/lib/server/resolve'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const all = new URL(req.url).searchParams.get('all') === '1'
  const idx = await tokenIndex(net)
  const assets = VERIFIED_ASSETS.map((a) => apiAsset(verifiedRef(a, idx)))
  const tokens = all
    ? [...idx.byAddress.values()]
        .filter((t) => !idx.slugByAddress.has(t.token_address.toLowerCase()))
        .map((t) => ({
          ...apiAsset(unverifiedRef(t.token_address, t, idx.profiles.get(t.token_address.toLowerCase()))),
          totalSupply: t.total_supply,
          maxSupply: t.max_supply,
          creator: t.creator,
          mintAuthority: t.mint_authority,
          freezeAuthority: t.freeze_authority,
          createdHeight: t.created_height,
        }))
    : undefined
  return json({ assets, tokens, nodeOk: idx.nodeOk, source: 'node', asOf: nowSec() }, 15)
})
export const OPTIONS = options
