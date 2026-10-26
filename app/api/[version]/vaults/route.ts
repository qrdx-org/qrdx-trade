import { cached } from '@/lib/server/cache'
import { handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { vaults } from '@/lib/server/trading'

/** User vaults (copy trading) and markets' liquidity vaults, largest first. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  return json(await cached(net.key('vaults'), 5_000, () => vaults(net)), 5)
})
export const OPTIONS = options
