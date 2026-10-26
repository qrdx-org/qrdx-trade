import { handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { collectionPage } from '@/lib/server/nfts'

/** One collection: its NFTs with their listings, its stats and sales. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; collection: string }> }) => {
  const { version, collection } = await params
  const net = netFromVersion(version)
  return json({ ...(await collectionPage(net, collection)), source: 'node', asOf: nowSec() }, 2)
})
export const OPTIONS = options
