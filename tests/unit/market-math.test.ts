/**
 * The arithmetic between the node's canonical pairs and the pairs users trade:
 * exact decimals, book orientation, order conversion, trade parsing and stats.
 * A mistake here shows a wrong price or signs a wrong order, so it is pinned.
 */
import { describe, expect, it } from 'vitest'
import { S, dec, divUp, lessSlippage, mul, pctChange, round, str } from '@/lib/decimal'
import { bookStats, canonicalPair, isInverted, orientBook, orientPrice } from '@/lib/pairs'
import { spotLimitParams } from '@/lib/orders'
import { tradeFromSwap } from '@/lib/server/indexer'
import { buildCandles, stats24h } from '@/lib/server/markets'
import type { NodeReceipt } from '@/lib/server/node'
import type { SpotMarket } from '@/lib/types'

const BTC = '0x0e3524986b660821eb1417212fc3b02de54e5658'
const USDC = '0x2a8f3d5cbfc77e2913ca8aaf1d4009ad3bf11ca7'
const ETH = '0x5f36765059df36d522fa815429c5777105733417'

describe('decimal', () => {
  it('parses and prints without float error', () => {
    expect(str(dec('0.1') + dec('0.2'))).toBe('0.3')
    expect(str(dec('1e-18'))).toBe('0.000000000000000001')
    expect(str(dec('1.5e3'))).toBe('1500')
    expect(str(dec('-2.50'))).toBe('-2.5')
    expect(() => dec('abc')).toThrow()
  })
  it('multiplies and divides at 18 places', () => {
    expect(S.mul('84975.7', '0.01')).toBe('849.757')
    expect(S.div('1', '3')).toBe('0.333333333333333333')
    expect(str(divUp(dec('1'), dec('3')))).toBe('0.333333333333333334')
    expect(S.inv('0')).toBeNull()
  })
  it('rounds, applies slippage downward, and computes change', () => {
    expect(round('1.23456', 2)).toBe('1.23')
    expect(round('1.235', 2)).toBe('1.24')
    expect(round('1.231', 2, 'up')).toBe('1.24')
    expect(lessSlippage('100', 0.5)).toBe('99.5')
    expect(lessSlippage('0.011758661', 0.5)).toBe('0.011699867695')
    expect(pctChange('100', '101.5')).toBe('1.5')
    expect(pctChange('0', '1')).toBeNull()
  })
})

describe('pair orientation', () => {
  it('sorts pairs like the node (string order of addresses)', () => {
    expect(canonicalPair(USDC, BTC)).toEqual({ pair: `${BTC}:${USDC}`, token0: BTC, token1: USDC })
    expect(isInverted(BTC, BTC)).toBe(false)
    expect(isInverted(ETH, USDC)).toBe(true)
  })

  it('inverts a book: canonical bids become asks at 1/p, sized in token1', () => {
    // Canonical USDC:ETH (USDC is token0), prices in ETH per USDC.
    const bids: [string, string][] = [['0.0004', '1000']] // buys 1000 USDC paying 0.4 ETH
    const asks: [string, string][] = [['0.0005', '2000']] // sells 2000 USDC for 1 ETH
    const o = orientBook(bids, asks, true) // view as ETH/USDC
    expect(o.asks).toEqual([['2500', '0.4', '0.4']]) // sells 0.4 ETH at 2500 USDC
    expect(o.bids).toEqual([['2000', '1', '1']]) // buys 1 ETH at 2000 USDC
    expect(bookStats(o.bids[0][0], o.asks[0][0])).toMatchObject({ mid: '2250', spread: '500' })
  })

  it('keeps best-first order and running totals', () => {
    const o = orientBook([['10', '1'], ['9', '2']], [['11', '3'], ['12', '1']], false)
    expect(o.bids.map((l) => l[2])).toEqual(['1', '3'])
    expect(o.asks.map((l) => l[0])).toEqual(['11', '12'])
    const inv = orientBook([['0.5', '1'], ['0.25', '1']], [], true)
    expect(inv.asks.map((l) => l[0])).toEqual(['2', '4']) // best (lowest) ask first
  })

  it('orients a pool price', () => {
    expect(orientPrice('0.0004', true)).toBe('2500')
    expect(orientPrice('85000', false)).toBe('85000')
  })
})

describe('spot limit orders in node terms', () => {
  const market = (inverted: boolean, base: string, quote: string) =>
    ({ inverted, base: { address: base }, quote: { address: quote } }) as unknown as SpotMarket

  it('passes a non-inverted order through', () => {
    expect(spotLimitParams(market(false, BTC, USDC), 'buy', '84000', '0.01')).toEqual({
      pair: `${BTC}:${USDC}`, side: 'buy', order_type: 'limit', price: '84000', amount: '0.01',
    })
  })

  it('turns "buy 0.5 ETH at 2642.77 USDC" into a USDC sell that never pays more than the limit', () => {
    const p = spotLimitParams(market(true, ETH, USDC), 'buy', '2642.77', '0.5')
    expect(p.pair).toBe(`${USDC}:${ETH}`)
    expect(p.side).toBe('sell')
    expect(p.amount).toBe('1321.385')
    // The seller's minimum (ETH per USDC) is rounded up: the user receives at least 0.5 ETH.
    expect(mul(dec(p.amount), dec(p.price))).toBeGreaterThanOrEqual(dec('0.5'))
    expect(dec(S.inv(p.price)!)).toBeLessThanOrEqual(dec('2642.77'))
  })

  it('turns "sell 0.5 ETH at 2642.77" into a USDC buy that never receives less than the limit', () => {
    const p = spotLimitParams(market(true, ETH, USDC), 'sell', '2642.77', '0.5')
    expect(p.side).toBe('buy')
    // The buyer's maximum (ETH per USDC) is rounded down: the user gives at most 0.5 ETH.
    expect(mul(dec(p.amount), dec(p.price))).toBeLessThanOrEqual(dec('0.5'))
  })
})

describe('swap indexing and stats', () => {
  const receipt = (data: Record<string, unknown>, success = true): NodeReceipt => ({
    tx_hash: 'ab'.repeat(32), block_height: 10, block_time: 1_700_000_000.5, op: 'SWAP', sender: '0xPQ',
    nonce: 0, success, error: '', gas_used: 0, gas_price: 0, fee: '0', data,
  })

  it('reads a buy of token0 (paying token1) with an exact price', () => {
    const t = tradeFromSwap(
      { tx_hash: 'x', params: { token_in: USDC, token_out: BTC.toUpperCase().replace('0X', '0x') } },
      receipt({ amount_in: '1000', amount_out: '0.0117586', source: 'amm', pool_id: 'p' })
    )!
    expect(t.pair).toBe(`${BTC}:${USDC}`)
    expect(t.side).toBe('buy')
    expect(t.size).toBe('0.0117586')
    expect(t.price).toBe(S.div('1000', '0.0117586'))
    expect(t.time).toBe(1_700_000_000)
  })

  it('ignores failed swaps', () => {
    expect(tradeFromSwap({ tx_hash: 'x', params: { token_in: USDC, token_out: BTC } }, receipt({}, false))).toBeNull()
  })

  it('computes 24 h change from the last trade before the window, and quote volume inside it', () => {
    const now = 1_000_000
    const s = stats24h(
      [
        { time: now - 90_000, price: '100', size: '5' },
        { time: now - 3600, price: '110', size: '2' },
        { time: now - 60, price: '121', size: '1' },
      ],
      now
    )
    expect(s.change24h).toBe('21')
    expect(s.volume24h).toBe('341')
    expect(s.last).toBe('121')
  })

  it('buckets trades into candles', () => {
    const c = buildCandles(
      [
        { time: 3600, price: '10', size: '1' },
        { time: 3700, price: '12', size: '1' },
        { time: 3800, price: '9', size: '2' },
        { time: 7300, price: '11', size: '1' },
      ],
      3600,
      10
    )
    expect(c).toEqual([
      { t: 3600, o: '10', h: '12', l: '9', c: '9', v: '4' },
      { t: 7200, o: '11', h: '11', l: '11', c: '11', v: '1' },
    ])
  })
})
