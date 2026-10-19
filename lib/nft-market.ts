/**
 * The NFT market: QRDX's native NFTs (qrdx-node docs/NATIVE_TOKENS.md §8) sold at fixed prices
 * through QRDXNFTMarket (contracts/QRDXNFTMarket.sol), an EVM contract. Each collection is an
 * ERC-721 inside the EVM, so the contract moves the NFT and the payment in one transaction;
 * nothing is escrowed. Shared by the API (lib/server/nfts.ts) and the pages.
 *
 * The contract's address is per network: NEXT_PUBLIC_QRDX_MAIN_NFT_MARKET and
 * NEXT_PUBLIC_QRDX_TEST_NFT_MARKET. Without one the market is read-only: collections and NFTs
 * are listed, nothing can be listed or bought.
 */

import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import type { Slot } from './config'
import artifact from './nft-market/artifact.json'

export const MARKET_ARTIFACT = artifact as { abi: unknown[]; bytecode: string; deployedBytecode: string; compiler: string }

/** Native QRDX as a listing's currency. */
export const QRDX_CURRENCY = '0x0000000000000000000000000000000000000000'

export function marketAddress(slot: Slot): string | null {
  // Literal process.env reads, so Next inlines them in the browser bundle.
  const raw = slot === 'main' ? process.env.NEXT_PUBLIC_QRDX_MAIN_NFT_MARKET : process.env.NEXT_PUBLIC_QRDX_TEST_NFT_MARKET
  return raw && /^0x[0-9a-fA-F]{40}$/.test(raw.trim()) ? raw.trim().toLowerCase() : null
}

// ── account ids (qrdx-node qrdx/crypto/account_id.py) ─────────────────────────

/**
 * The 20-byte account an address names: a 0x address is itself; a 0xPQ address is
 * keccak("QRDX-ACCOUNT-ID-v1:pq:" ‖ its 32 bytes)[-20:]. It is the address the EVM sees
 * (msg.sender, ownerOf), so it is how listings and owners are compared.
 */
export function accountId(address: string): string {
  const a = address.trim()
  if (/^0xPQ[0-9a-fA-F]{64}$/i.test(a) && !/^0xPQMS/i.test(a)) {
    const prefix = utf8ToBytes('QRDX-ACCOUNT-ID-v1:pq:')
    const body = hexToBytes(a.slice(4).toLowerCase())
    const buf = new Uint8Array(prefix.length + body.length)
    buf.set(prefix)
    buf.set(body, prefix.length)
    return '0x' + bytesToHex(keccak_256(buf).slice(-20))
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return a.toLowerCase()
  throw new Error(`Not a 0x or 0xPQ address: ${address}`)
}

export function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  try {
    return accountId(a) === accountId(b)
  } catch {
    return false
  }
}

// ── ABI ───────────────────────────────────────────────────────────────────────

const hash = (text: string) => bytesToHex(keccak_256(utf8ToBytes(text)))
export const selector = (signature: string) => '0x' + hash(signature).slice(0, 8)
export const topic = (signature: string) => '0x' + hash(signature)

const word = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')
const encAddress = (a: string) => word(accountId(a))
const encUint = (v: bigint) => {
  if (v < 0n) throw new Error('negative')
  return v.toString(16).padStart(64, '0')
}

export function listCall(collection: string, tokenId: string, currency: string, price: bigint): string {
  return selector('list(address,uint256,address,uint256)') + encAddress(collection) + encUint(BigInt(tokenId)) + word(currency) + encUint(price)
}
export function delistCall(collection: string, tokenId: string): string {
  return selector('delist(address,uint256)') + encAddress(collection) + encUint(BigInt(tokenId))
}
export function buyCall(collection: string, tokenId: string, currency: string, price: bigint): string {
  return selector('buy(address,uint256,address,uint256)') + encAddress(collection) + encUint(BigInt(tokenId)) + word(currency) + encUint(price)
}
export function listingsCall(collection: string, tokenId: string): string {
  return selector('listings(address,uint256)') + encAddress(collection) + encUint(BigInt(tokenId))
}
/** ERC-20 approve, for paying in a native token (its precompile: qrdx-node native_token_evm.py). */
export function approveCall(spender: string, amount: bigint): string {
  return selector('approve(address,uint256)') + encAddress(spender) + encUint(amount)
}

export const EVENTS = {
  Listed: topic('Listed(address,uint256,address,address,uint256)'),
  Delisted: topic('Delisted(address,uint256,address)'),
  Sold: topic('Sold(address,uint256,address,address,address,uint256,address,uint256)'),
}

/** The contract's custom errors, by selector, in words. */
export const MARKET_ERRORS: Record<string, string> = {
  [selector('ZeroPrice()')]: 'The price must be above zero.',
  [selector('NotOwner()')]: 'You do not own this NFT (or the listing is not yours).',
  [selector('NotApproved()')]: 'The market is not approved to move this NFT yet.',
  [selector('NotListed()')]: 'This NFT is not listed (any more).',
  [selector('TermsChanged()')]: 'The seller changed the price; review the new terms.',
  [selector('WrongPayment()')]: 'The payment does not match the price.',
  [selector('PaymentFailed()')]: 'The payment could not be made: check your balance and allowance.',
  [selector('Reentrant()')]: 'Reentrant call refused.',
}

export interface RawLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  logIndex: string
}

export type MarketEvent =
  | { kind: 'listed'; collection: string; tokenId: string; seller: string; currency: string; price: string; block: number; tx: string; index: number }
  | { kind: 'delisted'; collection: string; tokenId: string; seller: string; block: number; tx: string; index: number }
  | {
      kind: 'sold'
      collection: string
      tokenId: string
      buyer: string
      seller: string
      currency: string
      price: string
      royaltyReceiver: string
      royalty: string
      block: number
      tx: string
      index: number
    }

const addrOf = (w: string) => '0x' + w.replace(/^0x/, '').slice(-40).toLowerCase()
const uintOf = (w: string) => BigInt('0x' + (w.replace(/^0x/, '') || '0')).toString()
const words = (data: string) => (data.replace(/^0x/, '').match(/.{64}/g) ?? [])

/** One of the contract's logs, decoded; null for anything else. Prices stay in base units. */
export function decodeMarketLog(log: RawLog): MarketEvent | null {
  const [t0, t1, t2, t3] = log.topics.map((t) => t.toLowerCase())
  const base = { collection: addrOf(t1 ?? ''), tokenId: uintOf(t2 ?? '0x0'), block: Number(BigInt(log.blockNumber)), tx: log.transactionHash, index: Number(BigInt(log.logIndex ?? '0x0')) }
  const d = words(log.data)
  if (t0 === EVENTS.Listed && d.length >= 2) return { kind: 'listed', ...base, seller: addrOf(t3), currency: addrOf(d[0]), price: uintOf(d[1]) }
  if (t0 === EVENTS.Delisted) return { kind: 'delisted', ...base, seller: addrOf(t3) }
  if (t0 === EVENTS.Sold && d.length >= 5)
    return { kind: 'sold', ...base, buyer: addrOf(t3), seller: addrOf(d[0]), currency: addrOf(d[1]), price: uintOf(d[2]), royaltyReceiver: addrOf(d[3]), royalty: uintOf(d[4]) }
  return null
}

export interface ActiveListing {
  collection: string
  tokenId: string
  /** The seller's account id (what the EVM saw as msg.sender). */
  seller: string
  currency: string
  /** Base units of the currency (wei for QRDX). */
  price: string
  block: number
}

/** The listings standing after a run of events, oldest first: a listing is replaced by a later one and ends at a delisting or a sale. */
export function activeListings(events: MarketEvent[]): Map<string, ActiveListing> {
  const out = new Map<string, ActiveListing>()
  const sorted = [...events].sort((a, b) => a.block - b.block || a.index - b.index)
  for (const e of sorted) {
    const k = listingKey(e.collection, e.tokenId)
    if (e.kind === 'listed') out.set(k, { collection: e.collection, tokenId: e.tokenId, seller: e.seller, currency: e.currency, price: e.price, block: e.block })
    else out.delete(k)
  }
  return out
}

export const listingKey = (collection: string, tokenId: string) => `${collection.toLowerCase()}:${tokenId}`

// ── amounts ───────────────────────────────────────────────────────────────────

/** "1.5" → base units at `decimals`; throws on more places than the currency has. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(amount.trim())
  if (!m || (!m[1] && !m[2])) throw new Error('Enter an amount')
  const frac = m[2] ?? ''
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`)
  return BigInt((m[1] || '0') + frac.padEnd(decimals, '0'))
}

export function fromBaseUnits(units: string | bigint, decimals: number): string {
  const v = BigInt(units)
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

// ── metadata ──────────────────────────────────────────────────────────────────

export interface NftMetadata {
  name?: string
  description?: string
  image?: string
  external_url?: string
  attributes?: { trait_type?: string; value?: string | number }[]
}

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/'

/** An http(s) URL for a metadata or image URI: ipfs:// through a public gateway, data: as is. */
export function resolveUri(uri: string | null | undefined): string | null {
  if (!uri) return null
  const u = uri.trim()
  if (u.startsWith('ipfs://')) return IPFS_GATEWAY + u.slice(7).replace(/^ipfs\//, '')
  if (u.startsWith('ar://')) return 'https://arweave.net/' + u.slice(5)
  if (/^https?:\/\//.test(u) || u.startsWith('data:')) return u
  return null
}
