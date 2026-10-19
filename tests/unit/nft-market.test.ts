import { describe, expect, it } from 'vitest'
import { accountId, activeListings, buyCall, decodeMarketLog, EVENTS, fromBaseUnits, listCall, MARKET_ERRORS, selector, toBaseUnits, type MarketEvent } from '@/lib/nft-market'

describe('account ids (qrdx-node to_account_id)', () => {
  it('derives a 0xPQ account and keeps a 0x one', () => {
    expect(accountId('0xPQ' + 'a'.repeat(64))).toBe('0x3f47b3f72180bf4fa328f716f01920247d7c77ed')
    expect(accountId('0xPQ7883B5195F95a3A17884a20FB91c015bf6adDA07Ce35A6bcF7Fb6e0C599a5130')).toBe('0x8477262a3ea48b38d23aadf03e24536f3e4bf341')
    expect(accountId('0xAbC0000000000000000000000000000000000001')).toBe('0xabc0000000000000000000000000000000000001')
  })
})

describe('ABI', () => {
  it('uses the standard selectors', () => {
    expect(selector('approve(address,uint256)')).toBe('0x095ea7b3')
    expect(selector('transferFrom(address,address,uint256)')).toBe('0x23b872dd')
  })
  it('encodes list and buy with the collection, id, currency and price', () => {
    const c = '0x' + '11'.repeat(20)
    const data = listCall(c, '7', '0x' + '00'.repeat(20), 10n ** 18n)
    expect(data.slice(0, 10)).toBe(selector('list(address,uint256,address,uint256)'))
    expect(data.length).toBe(10 + 64 * 4)
    expect(data.slice(10, 74)).toBe('0'.repeat(24) + '11'.repeat(20))
    expect(BigInt('0x' + data.slice(74, 138))).toBe(7n)
    expect(BigInt('0x' + data.slice(202))).toBe(10n ** 18n)
    expect(buyCall(c, '7', '0x' + '00'.repeat(20), 1n).slice(0, 10)).toBe(selector('buy(address,uint256,address,uint256)'))
  })
  it('names the contract errors', () => {
    expect(MARKET_ERRORS[selector('TermsChanged()')]).toMatch(/changed the price/)
  })
})

describe('listings from logs', () => {
  const C = '0x' + 'cc'.repeat(20)
  const S = '0x' + 'aa'.repeat(20)
  const B = '0x' + 'bb'.repeat(20)
  const w = (h: string) => h.replace(/^0x/, '').padStart(64, '0')
  const log = (topics: string[], data: string[], block: number, index = 0) => ({
    address: '0xmarket', topics, data: '0x' + data.map(w).join(''), blockNumber: '0x' + block.toString(16), transactionHash: '0x' + block, logIndex: '0x' + index.toString(16),
  })
  const listed = (id: number, price: bigint, block: number) => decodeMarketLog(log([EVENTS.Listed, w(C), w(id.toString(16)), w(S)], ['0', price.toString(16)], block))!

  it('decodes each event', () => {
    const l = listed(1, 5n, 10)
    expect(l).toMatchObject({ kind: 'listed', collection: C, tokenId: '1', seller: S, currency: '0x' + '00'.repeat(20), price: '5', block: 10 })
    const s = decodeMarketLog(log([EVENTS.Sold, w(C), w('1'), w(B)], [S, '0', '5', S, '1'], 11))
    expect(s).toMatchObject({ kind: 'sold', buyer: B, seller: S, price: '5', royalty: '1' })
  })

  it('keeps the latest listing and drops sold or delisted ones', () => {
    const events: MarketEvent[] = [
      listed(1, 5n, 10),
      listed(1, 7n, 12),
      listed(2, 9n, 13),
      decodeMarketLog(log([EVENTS.Delisted, w(C), w('2'), w(S)], [], 14))!,
      listed(3, 4n, 15),
      decodeMarketLog(log([EVENTS.Sold, w(C), w('3'), w(B)], [S, '0', '4', S, '0'], 16))!,
    ]
    const active = activeListings(events.reverse())
    expect([...active.values()].map((l) => [l.tokenId, l.price])).toEqual([['1', '7']])
  })
})

describe('amounts', () => {
  it('converts to and from base units exactly', () => {
    expect(toBaseUnits('1.5', 18)).toBe(15n * 10n ** 17n)
    expect(toBaseUnits('200', 6)).toBe(200_000_000n)
    expect(() => toBaseUnits('0.0000001', 6)).toThrow()
    expect(fromBaseUnits(15n * 10n ** 17n, 18)).toBe('1.5')
    expect(fromBaseUnits('200000000', 6)).toBe('200')
  })
})
