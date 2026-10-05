import { handler, intParam, json, options } from '@/lib/server/http'
import { pool } from '@/lib/server/accounts'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string; poolId: string }> }) => {
  const { version, poolId } = await params
  const net = netFromVersion(version)
  const twap = intParam(new URL(req.url), 'twap', 0, 0, 7 * 86_400)
  return json(await pool(net, decodeURIComponent(poolId), twap || undefined), 2)
})
export const OPTIONS = options
