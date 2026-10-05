import { ApiError, handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; txHash: string }> }) => {
  const { version, txHash } = await params
  const net = netFromVersion(version)
  const hash = txHash.toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ApiError('bad_request', 'txHash must be 32 bytes of hex')
  const receipt = await net.node.receipt(hash)
  if (!receipt) throw new ApiError('not_found', 'No receipt yet: pending, or unknown to this node')
  // A receipt never changes once it exists.
  return json({ ...receipt, source: 'node' }, 3600)
})
export const OPTIONS = options
