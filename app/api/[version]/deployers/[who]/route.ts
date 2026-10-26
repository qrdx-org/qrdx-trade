import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

/** A perp market deployer, by address or namespace: its bond, what is unbonding, and its markets (null: none). */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; who: string }> }) => {
  const { version, who } = await params
  if (!/^(0xPQ[0-9a-fA-F]{64}|[a-z][a-z0-9]{0,7})$/.test(who)) throw new ApiError('bad_request', 'Expected a 0xPQ… address or a namespace')
  const d = await netFromVersion(version).node.deployer(who)
  return json({ deployer: d ? { ...d, unlock: d.unlock ? Number(d.unlock) : null } : null, source: 'node', asOf: nowSec() }, 5)
})
export const OPTIONS = options
