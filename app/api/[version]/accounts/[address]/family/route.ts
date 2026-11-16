import { handler, json, options } from '@/lib/server/http'
import { accountFamily } from '@/lib/server/accounts'
import { netFromVersion } from '@/lib/server/net'

/** The wallet account, its sub-accounts and the vaults it leads, each with its balances and perps account. */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string; address: string }> }) => {
  const { version, address } = await params
  const extra = (new URL(req.url).searchParams.get('tokens') ?? '').split(',').filter(Boolean).slice(0, 100)
  return json(await accountFamily(netFromVersion(version), address, extra), 2)
})
export const OPTIONS = options
