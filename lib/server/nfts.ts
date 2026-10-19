/**
 * The NFT market's reads: collections and NFTs from the node's native registry
 * (docs/NATIVE_TOKENS.md §8), and listings and sales from QRDXNFTMarket's logs (lib/nft-market).
 *
 * A listing is only as good as the chain says now: it is shown as live when its seller still
 * owns the NFT and the market may still move it. Otherwise it is "stale": buying it would
 * revert, and anyone may clear it.
 *
 * The node has no index of a collection's members, so they are read by id: 1 up to the number
 * minted (the default numbering), plus the ids its mint authority and creator minted by name in
 * their transaction history (`NFT_MINT` with `token_id`). Bounded at MAX_ITEMS a collection.
 */

import { accountId, activeListings, decodeMarketLog, listingKey, marketAddress, QRDX_CURRENCY, sameAccount, type ActiveListing, type MarketEvent } from '../nft-market'
import { cached } from './cache'
import { ApiError } from './http'
import type { Net } from './net'
import type { NodeNft, NodeNftCollection } from './node'

const MAX_ITEMS = 2000
const REORG_DEPTH = 64

export interface Currency {
  address: string
  symbol: string
  decimals: number
}

export interface NftListing extends ActiveListing {
  /** The seller still owns it and the market may move it: buying it settles. */
  live: boolean
  priceDisplay: string
  /** The currency's symbol and decimals. */
  symbol: string
  decimals: number
}

export interface NftItem extends NodeNft {
  /** The owner's account id (what the EVM and listings name). */
  ownerId: string
  listing: NftListing | null
}

export interface NftSale {
  collection: string
  tokenId: string
  buyer: string
  seller: string
  currency: Currency
  price: string
  royalty: string
  block: number
  tx: string
}

export interface CollectionStats {
  listed: number
  /** Lowest live QRDX listing, in QRDX. */
  floor: string | null
  sales: number
  /** Sum of QRDX sales, in QRDX. */
  volume: string
  owners: number | null
}

// ── market logs ──────────────────────────────────────────────────────────────

interface LogState {
  events: MarketEvent[]
  /** Highest block read. */
  head: number
}
const logState = new Map<string, LogState>()

/** Every market event so far, read incrementally (the last REORG_DEPTH blocks are re-read). */
export async function marketEvents(net: Net): Promise<MarketEvent[]> {
  const market = marketAddress(net.slot)
  if (!market) return []
  return cached(net.key(`nft-events:${market}`), 2_000, async () => {
    const key = net.key(market)
    const prev = logState.get(key)
    const from = prev ? Math.max(0, prev.head - REORG_DEPTH) : 0
    const logs = await net.node.logs({ address: market, fromBlock: from })
    const fresh = logs.map(decodeMarketLog).filter((e): e is MarketEvent => !!e)
    const kept = (prev?.events ?? []).filter((e) => e.block < from)
    const events = [...kept, ...fresh]
    const head = Math.max(prev?.head ?? 0, ...fresh.map((e) => e.block), from)
    logState.set(key, { events, head })
    return events
  })
}

// ── currencies ───────────────────────────────────────────────────────────────

export async function currency(net: Net, address: string): Promise<Currency> {
  if (address.toLowerCase() === QRDX_CURRENCY) return { address: QRDX_CURRENCY, symbol: 'QRDX', decimals: 18 }
  return cached(net.key(`nft-currency:${address.toLowerCase()}`), 300_000, async () => {
    const t = await net.node.token(address).catch(() => null)
    return { address: address.toLowerCase(), symbol: t?.symbol ?? `${address.slice(0, 6)}…`, decimals: t?.decimals ?? 18 }
  })
}

export function display(units: string, decimals: number): string {
  const v = BigInt(units)
  const base = 10n ** BigInt(decimals)
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${v / base}.${frac}` : `${v / base}`
}

// ── collections ──────────────────────────────────────────────────────────────

export function collections(net: Net): Promise<NodeNftCollection[]> {
  return cached(net.key('nft-collections'), 5_000, () => net.node.nftCollections())
}

export async function collection(net: Net, address: string): Promise<NodeNftCollection> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new ApiError('bad_request', `Not a collection address: ${address}`)
  const c = await cached(net.key(`nft-collection:${address.toLowerCase()}`), 5_000, () => net.node.nftCollection(address))
  if (!c) throw new ApiError('not_found', `No NFT collection at ${address}`)
  return c
}

/** The token ids a collection may hold: 1..minted and any its minters named themselves. */
async function memberIds(net: Net, c: NodeNftCollection): Promise<string[]> {
  return cached(net.key(`nft-ids:${c.collection}:${c.minted}`), 30_000, async () => {
    const ids = new Set<string>()
    for (let i = 1; i <= Math.min(c.minted, MAX_ITEMS); i++) ids.add(String(i))
    const minters = [...new Set([c.mint_authority, c.creator].filter((a): a is string => !!a))]
    for (const minter of minters) {
      const page = await net.node.history(minter, { kinds: 'exchange', limit: 500 }).catch(() => null)
      for (const t of page?.transactions ?? []) {
        if (t.op !== 'NFT_MINT' || t.status === 'failed') continue
        const p = t.detail?.params ?? {}
        if (String(p.collection ?? t.detail?.collection ?? '').toLowerCase() !== c.collection.toLowerCase()) continue
        const id = t.detail?.token_id ?? p.token_id
        if (id != null) ids.add(String(id))
      }
    }
    return [...ids].slice(0, MAX_ITEMS)
  })
}

/** Whether the market may move each NFT: an operator for its owner, or its approved account. */
async function approvals(net: Net, market: string, items: { collection: string; owner: string; approved: string | null }[]): Promise<boolean[]> {
  const pairs = [...new Set(items.map((i) => `${i.collection.toLowerCase()}|${accountId(i.owner)}`))]
  const answers = await net.node.batch<boolean>(pairs.map((p) => ({ method: 'exchange_isNftOperator', params: [p.split('|')[0], p.split('|')[1], market] })))
  const operator = new Map(pairs.map((p, i) => [p, answers[i] === true]))
  return items.map((i) => operator.get(`${i.collection.toLowerCase()}|${accountId(i.owner)}`) === true || sameAccount(i.approved, market))
}

/** NFTs with their listing, if any, and whether it is live. */
async function withListings(net: Net, nfts: NodeNft[], listings: Map<string, ActiveListing>): Promise<NftItem[]> {
  const market = marketAddress(net.slot)
  const listed = nfts.map((n) => listings.get(listingKey(n.collection, n.token_id)) ?? null)
  const approved = market ? await approvals(net, market, nfts.filter((_, i) => listed[i])) : []
  // The approval answer for each listed NFT, by its position among the listed ones.
  const approvedAt = new Map<number, boolean>()
  listed.forEach((l, i) => l && approvedAt.set(i, approved[approvedAt.size] === true))
  return Promise.all(
    nfts.map(async (n, i) => {
      const l = listed[i]
      let listing: NftListing | null = null
      if (l) {
        const cur = await currency(net, l.currency)
        const live = sameAccount(n.owner, l.seller) && approvedAt.get(i) === true
        listing = { ...l, live, priceDisplay: display(l.price, cur.decimals), symbol: cur.symbol, decimals: cur.decimals }
      }
      return { ...n, ownerId: accountId(n.owner), listing }
    })
  )
}

export async function sales(net: Net, events: MarketEvent[], filter?: (e: MarketEvent) => boolean): Promise<NftSale[]> {
  const sold = events.filter((e): e is Extract<MarketEvent, { kind: 'sold' }> => e.kind === 'sold' && (!filter || filter(e)))
  return Promise.all(
    sold
      .sort((a, b) => b.block - a.block || b.index - a.index)
      .slice(0, 100)
      .map(async (e) => ({
        collection: e.collection,
        tokenId: e.tokenId,
        buyer: e.buyer,
        seller: e.seller,
        currency: await currency(net, e.currency),
        price: e.price,
        royalty: e.royalty,
        block: e.block,
        tx: e.tx,
      }))
  )
}

function stats(items: NftItem[] | null, events: MarketEvent[], collectionAddress: string, listings: Map<string, ActiveListing>): CollectionStats {
  const mine = (e: { collection: string }) => e.collection.toLowerCase() === collectionAddress.toLowerCase()
  const sold = events.filter((e) => e.kind === 'sold' && mine(e)) as Extract<MarketEvent, { kind: 'sold' }>[]
  const volume = sold.filter((e) => e.currency === QRDX_CURRENCY).reduce((s, e) => s + BigInt(e.price), 0n)
  const live = items ? items.map((i) => i.listing).filter((l): l is NftListing => !!l?.live) : [...listings.values()].filter(mine).map((l) => ({ ...l, live: true, priceDisplay: '', symbol: '', decimals: 18 }))
  const qrdxPrices = live.filter((l) => l.currency === QRDX_CURRENCY).map((l) => BigInt(l.price))
  const floor = qrdxPrices.length ? qrdxPrices.reduce((a, b) => (a < b ? a : b)) : null
  return {
    listed: live.length,
    floor: floor == null ? null : display(floor.toString(), 18),
    sales: sold.length,
    volume: display(volume.toString(), 18),
    owners: items ? new Set(items.map((i) => i.ownerId)).size : null,
  }
}

/** Every collection with its market stats (listings counted as recorded; liveness is per page). */
export async function marketOverview(net: Net) {
  const [list, events] = await Promise.all([collections(net), marketEvents(net)])
  const listings = activeListings(events)
  return {
    market: marketAddress(net.slot),
    collections: list.map((c) => ({ ...c, stats: stats(null, events, c.collection, listings) })),
    sales: await sales(net, events),
  }
}

/** One collection: its members, each with its live or stale listing, its stats and sales. */
export async function collectionPage(net: Net, address: string) {
  const c = await collection(net, address)
  const [ids, events] = await Promise.all([memberIds(net, c), marketEvents(net)])
  const nfts = (await net.node.batch<NodeNft>(ids.map((id) => ({ method: 'exchange_getNft', params: [c.collection, id] })))).filter((n): n is NodeNft => !!n)
  nfts.sort((a, b) => Number(BigInt(a.token_id) - BigInt(b.token_id)))
  const listings = activeListings(events)
  const items = await withListings(net, nfts, listings)
  return {
    market: marketAddress(net.slot),
    collection: c,
    items,
    truncated: c.minted > MAX_ITEMS,
    stats: stats(items, events, c.collection, listings),
    sales: await sales(net, events, (e) => e.collection.toLowerCase() === c.collection.toLowerCase()),
  }
}

/** One NFT with its listing and its market history. */
export async function itemPage(net: Net, address: string, tokenId: string) {
  if (!/^\d+$/.test(tokenId)) throw new ApiError('bad_request', 'The token id is a whole number')
  const c = await collection(net, address)
  const n = await net.node.nft(c.collection, tokenId)
  if (!n) throw new ApiError('not_found', `No NFT #${tokenId} in ${c.name}`)
  const events = await marketEvents(net)
  const [item] = await withListings(net, [n], activeListings(events))
  const history = events
    .filter((e) => e.collection.toLowerCase() === c.collection.toLowerCase() && e.tokenId === tokenId)
    .sort((a, b) => b.block - a.block || b.index - a.index)
  return {
    market: marketAddress(net.slot),
    collection: c,
    item,
    history: await Promise.all(
      history.map(async (e) => ({ ...e, currency: 'currency' in e ? await currency(net, e.currency) : null }))
    ),
  }
}

/** The NFTs an account owns, each with its listing and whether the market may move it. */
export async function accountNfts(net: Net, owner: string) {
  if (!/^0x(PQ[0-9a-fA-F]{64}|[0-9a-fA-F]{40})$/.test(owner)) throw new ApiError('bad_request', `Not an address: ${owner}`)
  const [nfts, events] = await Promise.all([net.node.nftsOf(owner, null, 500), marketEvents(net)])
  const market = marketAddress(net.slot)
  const items = await withListings(net, nfts, activeListings(events))
  const approved = market ? await approvals(net, market, nfts) : nfts.map(() => false)
  const ownerId = accountId(owner)
  const theirs = [...activeListings(events).values()].filter((l) => l.seller === ownerId)
  return {
    market,
    items: items.map((i, k) => ({ ...i, marketApproved: approved[k] })),
    /** Listings this account left that no longer match an NFT it owns (stale: clear them). */
    staleListings: theirs.filter((l) => !items.some((i) => i.listing && listingKey(i.collection, i.token_id) === listingKey(l.collection, l.tokenId))),
  }
}
