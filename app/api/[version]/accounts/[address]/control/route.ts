import { handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { accountControl } from '@/lib/server/trading'

/** Who may trade for an account (agents), its sub-accounts and vaults, its fee tier and referral. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string; address: string }> }) => {
  const { version, address } = await params
  return json(await accountControl(netFromVersion(version), address), 2)
})
export const OPTIONS = options
