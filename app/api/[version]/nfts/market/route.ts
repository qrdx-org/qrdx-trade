import { forget } from '@/lib/server/cache'
import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'
import { nftMarket } from '@/lib/server/nfts'
import { relayPost } from '@/lib/server/relay-service'
import { isMarketCode, MARKET_CODE_HASH } from '@/lib/nft-market-code'

/** The network's NFT market contract (null: trading is closed), and the code it must have. */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  return json({ market: await nftMarket(net), codeHash: MARKET_CODE_HASH, source: 'node', asOf: nowSec() }, 10)
})

/**
 * Register a deployment of contracts/QRDXNFTMarket.sol as this network's market, for everyone
 * (the relay's registry): `{ address }`. Accepted only if its code on chain is the market's,
 * and only while the network has no live market.
 */
export const POST = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const body = (await req.json().catch(() => null)) as { address?: unknown } | null
  const address = typeof body?.address === 'string' ? body.address.trim().toLowerCase() : ''
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new ApiError('bad_request', 'body must be { address: "0x…" }')
  if (!isMarketCode(await net.node.code(address).catch(() => null))) {
    throw new ApiError('bad_request', `${address} does not have the NFT market's code (contracts/QRDXNFTMarket.sol)`)
  }
  const current = await nftMarket(net)
  if (current && current !== address) throw new ApiError('bad_request', `This network's NFT market is ${current} already`)
  try {
    await relayPost(`${net.cfg.profilesUrl}/v1/${net.cfg.id}/nft-market`, { address }, 'nft market registry')
  } catch (e) {
    throw new ApiError('node_unavailable', `The registry did not take it: ${(e as Error).message}`)
  }
  forget(net.key('nft-market'))
  return json({ market: await nftMarket(net), source: 'node', asOf: nowSec() }, 0)
})
export const OPTIONS = options
