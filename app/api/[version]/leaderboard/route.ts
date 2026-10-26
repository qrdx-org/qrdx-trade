import { cached } from '@/lib/server/cache'
import { handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { leaderboard } from '@/lib/server/trading'

/** Perps accounts ranked by realized PnL net of fees, or by volume, over a window. */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const q = new URL(req.url).searchParams
  const window = q.get('window') ?? 'week'
  const metric = q.get('metric') ?? 'pnl'
  const limit = Number(q.get('limit') ?? 50) || 50
  return json(await cached(net.key(`leaderboard:${window}:${metric}:${limit}`), 30_000, () => leaderboard(net, window, metric, limit)), 30)
})
export const OPTIONS = options
