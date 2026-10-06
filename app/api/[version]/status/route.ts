import { cached } from '@/lib/server/cache'
import { handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

/** Node health for the status bar: chain height, last block, and how long the node took to answer. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const { version } = await params
  const net = netFromVersion(version)
  const { cfg } = net
  const body = await cached(net.key('status'), 3_000, async () => {
    const t0 = Date.now()
    try {
      const s = await net.node.status()
      return { nodeOk: s.height >= 0, height: s.height, lastBlockHash: s.last_block_hash ?? null, latencyMs: Date.now() - t0 }
    } catch {
      return { nodeOk: false, height: null, lastBlockHash: null, latencyMs: null }
    }
  })
  return json(
    { network: cfg.id, networkName: cfg.name, chainId: cfg.chainId, blockTimeSec: cfg.blockTimeSec, ...body, asOf: nowSec() },
    2
  )
})
export const OPTIONS = options
