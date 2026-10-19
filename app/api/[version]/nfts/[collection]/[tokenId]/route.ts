import { handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { itemPage } from '@/lib/server/nfts'

export const runtime = 'edge'

/** One NFT: owner, metadata uri, listing (live or stale) and its market history. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; collection: string; tokenId: string }> }) => {
  const { version, collection, tokenId } = await params
  const net = netFromVersion(version)
  return json({ ...(await itemPage(net, collection, tokenId)), source: 'node', asOf: nowSec() }, 2)
})
export const OPTIONS = options
