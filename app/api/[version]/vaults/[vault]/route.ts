import { ApiError, handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { vault } from '@/lib/server/trading'

export const runtime = 'edge'

/** One vault: NAV, shares, positions; with ?holder= that account's shares, cost and value. */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string; vault: string }> }) => {
  const { version, vault: address } = await params
  if (!/^0xUVLT[0-9a-fA-F]{36}$/.test(address)) throw new ApiError('bad_request', 'Expected a 0xUVLT… vault address')
  return json(await vault(netFromVersion(version), address, new URL(req.url).searchParams.get('holder')), 2)
})
export const OPTIONS = options
