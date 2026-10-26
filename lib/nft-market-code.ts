/**
 * Which deployed contract is the NFT market: the one whose runtime code is
 * contracts/QRDXNFTMarket.sol's, byte for byte (lib/nft-market/artifact.json). The contract has
 * no owner and no settings, so any deployment of it is as good as another; checking the code
 * on chain is what makes an address safe to trade through. Shared by the API and the relay's
 * registry (relay/src/profiles-do.ts).
 */

import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import artifact from './nft-market/artifact.json'

const strip = (hex: string) => hex.replace(/^0x/, '').toLowerCase()

/** keccak256 of the market's runtime code. */
export const MARKET_CODE_HASH = '0x' + bytesToHex(keccak_256(hexToBytes(strip((artifact as { deployedBytecode: string }).deployedBytecode))))

/** Whether `code` (eth_getCode) is the market's. */
export function isMarketCode(code: string | null | undefined): boolean {
  const c = strip(code ?? '')
  return c.length > 0 && '0x' + bytesToHex(keccak_256(hexToBytes(c))) === MARKET_CODE_HASH
}

/** eth_getCode of `address` on a node, then the check. Throws when the node does not answer. */
export async function marketCodeAt(rpcUrl: string, address: string): Promise<boolean> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await res.json().catch(() => null)) as { result?: string } | null
  if (!res.ok || !body) throw new Error('the QRDX node is unreachable')
  return isMarketCode(body.result)
}
