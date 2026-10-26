import { handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { accountHistory } from '@/lib/server/trading'

export const runtime = 'edge'

/** An account's trades or order events from the node's trading history, newest first. */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string; address: string }> }) => {
  const { version, address } = await params
  const q = new URL(req.url).searchParams
  return json(
    await accountHistory(netFromVersion(version), address, q.get('kind') ?? 'trades', {
      market: q.get('market') ?? undefined,
      limit: Math.max(1, Math.min(500, Number(q.get('limit') ?? 100) || 100)),
      cursor: q.get('cursor'),
    }),
    5
  )
})
export const OPTIONS = options
