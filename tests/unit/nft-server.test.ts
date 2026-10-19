/**
 * The NFT market's server reads over a stubbed node: a listing is live only while its seller
 * owns the NFT and the market may move it; floor, volume and sales come from the market's logs.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { accountId, EVENTS } from '@/lib/nft-market'

const MARKET = '0x' + '4d'.repeat(20)
const COLL = '0x' + 'cc'.repeat(20)
const SELLER = '0xPQ' + 'a'.repeat(64)
const BUYER = '0xPQ' + 'b'.repeat(64)
const w = (h: string) => h.replace(/^0x/, '').padStart(64, '0')
const log = (topics: string[], data: string[], block: number) => ({
  address: MARKET, topics, data: '0x' + data.map(w).join(''), blockNumber: '0x' + block.toString(16), transactionHash: '0xt' + block, logIndex: '0x0',
})
const listed = (id: number, wei: bigint, block: number, seller = SELLER) => log([EVENTS.Listed, w(COLL), w(id.toString(16)), w(accountId(seller))], ['0', wei.toString(16)], block)
const sold = (id: number, wei: bigint, block: number) => log([EVENTS.Sold, w(COLL), w(id.toString(16)), w(accountId(BUYER))], [accountId(SELLER), '0', wei.toString(16), accountId(SELLER), '0'], block)

// NFT 1: listed for 2 QRDX, the market approved: live. NFT 2: listed, then given away: stale.
// NFT 3: listed at 1, sold: not listed. NFT 4: listed but the market not approved: stale.
const owners: Record<string, string> = { '1': SELLER, '2': BUYER, '3': BUYER, '4': '0x' + 'e4'.repeat(20) }
const node = {
  nftCollections: async () => [collectionRow],
  nftCollection: async () => collectionRow,
  nft: async (_c: string, id: string) => nftRow(id),
  nftsOf: async () => [nftRow('1')],
  history: async () => ({ transactions: [], next_cursor: null }),
  token: async () => null,
  logs: async () => [listed(1, 2n * 10n ** 18n, 10), listed(2, 5n * 10n ** 18n, 11), listed(3, 10n ** 18n, 12), sold(3, 10n ** 18n, 13), listed(4, 3n * 10n ** 18n, 14, owners['4'])],
  batch: async (calls: { method: string; params: unknown[] }[]) =>
    calls.map((c) =>
      c.method === 'exchange_getNft'
        ? nftRow(String(c.params[1]))
        : c.method === 'exchange_isNftOperator'
          ? String(c.params[1]) === accountId(SELLER) // only the first seller approved the market
          : null
    ),
}
const collectionRow = { collection: COLL, name: 'Lattice', symbol: 'LAT', uri: '', creator: SELLER, max_supply: null, supply: 4, minted: 4, burned: 0, royalty_bps: 500, royalty_recipient: SELLER, update_authority: SELLER, mint_authority: SELLER, non_transferable: false, created_height: 1 }
const nftRow = (id: string) => (owners[id] ? { collection: COLL, token_id: id, owner: owners[id], uri: '', name: `#${id}`, approved: null, minted_height: 1 } : null)

vi.mock('@/lib/server/cache', () => ({ cached: (_k: string, _t: number, load: () => Promise<unknown>) => load() }))

let mod: typeof import('@/lib/server/nfts')
const net = { slot: 'test', node, key: (k: string) => k, cfg: {} } as never

beforeAll(async () => {
  process.env.NEXT_PUBLIC_QRDX_TEST_NFT_MARKET = MARKET
  mod = await import('@/lib/server/nfts')
})

describe('NFT market reads', () => {
  it('marks listings live or stale from ownership and approval', async () => {
    const page = await mod.collectionPage(net, COLL)
    const by = Object.fromEntries(page.items.map((i) => [i.token_id, i.listing]))
    expect(by['1']).toMatchObject({ live: true, priceDisplay: '2', symbol: 'QRDX' })
    expect(by['2']).toMatchObject({ live: false })
    expect(by['3']).toBeNull()
    expect(by['4']).toMatchObject({ live: false })
  })

  it('counts the floor from live QRDX listings and the volume from sales', async () => {
    const page = await mod.collectionPage(net, COLL)
    expect(page.stats).toMatchObject({ listed: 1, floor: '2', sales: 1, volume: '1', owners: 3 })
    expect(page.sales).toHaveLength(1)
    expect(page.sales[0]).toMatchObject({ tokenId: '3', price: (10n ** 18n).toString() })
  })

  it('lists an account’s NFTs with whether the market may move them', async () => {
    const mine = await mod.accountNfts(net, SELLER)
    expect(mine.items[0]).toMatchObject({ token_id: '1', marketApproved: true })
    // its listing of #2, which it no longer owns, is stale
    expect(mine.staleListings.map((l) => l.tokenId)).toEqual(['2'])
  })
})
