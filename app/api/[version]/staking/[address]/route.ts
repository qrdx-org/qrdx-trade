import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

/**
 * One address's delegations (shares and their value in each pool, warming-up amounts),
 * the payouts owed to it, and the QRDX it can delegate. Delegation spends the post-quantum
 * account's own QRDX, so pass the 0xPQ address.
 */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; address: string }> }) => {
  const { version, address } = await params
  if (!/^0x(PQ[0-9a-fA-F]{64}|[0-9a-fA-F]{40})$/i.test(address)) throw new ApiError('bad_request', 'Not a QRDX address')
  const net = netFromVersion(version)
  const [delegations, balance] = await Promise.all([net.node.delegations(address), net.node.nativeBalance(address).catch(() => null)])
  return json({ ...delegations, balance, asOf: nowSec() }, 2)
})
export const OPTIONS = options
