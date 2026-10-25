import { features } from '@/lib/server/features'
import { handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

/** What this network's node runs (the 2026-10 trading features, its history database) and what the protocol charges. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const { version } = await params
  return json(await features(netFromVersion(version)), 30)
})
export const OPTIONS = options
