import { handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { accountNfts } from '@/lib/server/nfts'

export const runtime = 'edge'

/** The NFTs an account owns, with listings and whether the market may move each, and its stale listings. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; address: string }> }) => {
  const { version, address } = await params
  const net = netFromVersion(version)
  return json({ ...(await accountNfts(net, address)), source: 'node', asOf: nowSec() }, 2)
})
export const OPTIONS = options
