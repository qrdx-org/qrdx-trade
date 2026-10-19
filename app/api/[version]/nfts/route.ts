import { handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { marketOverview } from '@/lib/server/nfts'

export const runtime = 'edge'

/** The NFT market: every native collection with its listings and sales, and recent sales (lib/server/nfts.ts). */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  return json({ ...(await marketOverview(net)), source: 'node', asOf: nowSec() }, 2)
})
export const OPTIONS = options
