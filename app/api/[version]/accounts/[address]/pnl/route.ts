import { handler, json, options } from '@/lib/server/http'
import { checkTraderAddress } from '@/lib/server/accounts'
import { netFromVersion } from '@/lib/server/net'
import { accountPnl } from '@/lib/server/pnl'

export const runtime = 'edge'

/** Realized and unrealized trading PnL, per market and over time (lib/server/pnl.ts). */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; address: string }> }) => {
  const { version, address } = await params
  checkTraderAddress(address)
  return json(await accountPnl(netFromVersion(version), address), 10)
})
export const OPTIONS = options
