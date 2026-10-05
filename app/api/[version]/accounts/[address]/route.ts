import { handler, json, options } from '@/lib/server/http'
import { account } from '@/lib/server/accounts'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (req, { params }: { params: Promise<{ version: string; address: string }> }) => {
  const { version, address } = await params
  const net = netFromVersion(version)
  const extra = (new URL(req.url).searchParams.get('tokens') ?? '').split(',').filter(Boolean)
  return json(await account(net, address, extra), 2)
})
export const OPTIONS = options
