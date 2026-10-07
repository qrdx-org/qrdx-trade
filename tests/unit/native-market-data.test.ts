/** The node's market data oriented to a URL's pair, and perps collateral top-ups. */
import { describe, expect, it } from 'vitest'
import { orientNodeCandles, orientNodeTrade, tickerStats } from '@/lib/server/market-data'
import { canonicalPair } from '@/lib/pairs'
import { collateralShortfall, walletCollateral } from '@/lib/perps'
import type { NodeTicker } from '@/lib/server/node'
import type { AccountResponse } from '@/lib/types'

const USDC = '0x2a8f3d5cbfc77e2913ca8aaf1d4009ad3bf11ca7'

describe('native QRDX pairs', () => {
  it('sorts QRDX after every token address, as the node does', () => {
    expect(canonicalPair('QRDX', USDC)).toEqual({ pair: `${USDC}:QRDX`, token0: USDC, token1: 'QRDX' })
  })
})

describe('node market data', () => {
  const ticker = (over: Partial<NodeTicker> = {}): NodeTicker => ({
    market: `${USDC}:QRDX`, type: 'spot', base: USDC, quote: 'QRDX', best_bid: null, best_ask: null,
    last_price: '1.25', open_24h: '1', high_24h: '1.3', low_24h: '1', change_pct_24h: '25.00',
    volume_24h: '100', quote_volume_24h: '120', trades_24h: 4, ...over,
  })
  it('reads 24 h stats in the URL orientation', () => {
    // canonical: QRDX per USDC 1 → 1.25 (+25 %), base volume 100 USDC, quote 120 QRDX
    expect(tickerStats(ticker(), false)).toEqual({ last: '1.25', change24h: '25.00', volume24h: '120' })
    // /trade/qrdx/usdc: USDC per QRDX 1 → 0.8 (−20 %), volume in USDC
    expect(tickerStats(ticker(), true)).toEqual({ last: '0.8', change24h: '-20.00', volume24h: '100' })
    expect(tickerStats(ticker({ trades_24h: 0 }), false)).toBeNull()
  })
  it('orients trades and normalises the node’s long decimals', () => {
    const t = orientNodeTrade(
      { seq: 7, market: '', price: '2.000000000000000000000000000001', amount: '3', quote_amount: '6', side: 'buy', venue: 'amm', block_height: 9, block_time: 100.5, tx_hash: 'ab', maker: null, taker: null, pool_id: 'p' },
      true
    )
    expect(t).toEqual({ id: '7', time: 100, price: '0.5', size: '6', side: 'sell', venue: 'amm', txHash: 'ab', blockHeight: 9 })
  })
  it('makes candles continuous, carrying the close through intervals without trades', () => {
    const c = orientNodeCandles(
      [
        { time: 0, open: '1', high: '2', low: '1', close: '2', volume: '5', quote_volume: '7', trades: 2 },
        { time: 120, open: '2', high: '4', low: '2', close: '4', volume: '1', quote_volume: '3', trades: 1 },
      ],
      false,
      60,
      10,
      200
    )
    expect(c.map((x) => [x.t, x.o, x.c, x.v])).toEqual([
      [0, '1', '2', '5'],
      [60, '2', '2', '0'],
      [120, '2', '4', '1'],
      [180, '4', '4', '0'],
    ])
    // inverted: high and low swap, volume is the quote side
    expect(orientNodeCandles([{ time: 0, open: '2', high: '4', low: '1', close: '2', volume: '5', quote_volume: '7', trades: 1 }], true, 60, 10, 0)[0]).toEqual({
      t: 0, o: '0.5', h: '1', l: '0.25', c: '0.5', v: '7',
    })
  })
})

describe('perps collateral', () => {
  const account = { perp: { collateral_token: 'QRDX', withdrawable: '860.79' }, balances: [{ asset: { address: 'QRDX' }, balance: '7330000' }] } as unknown as AccountResponse
  it('finds the wallet’s balance of the collateral asset (native QRDX here)', () => {
    expect(walletCollateral(account)).toBe('7330000')
    expect(walletCollateral({ ...account, perp: { ...account.perp!, collateral_token: '' } } as AccountResponse)).toBeNull()
  })
  it('tops up what an order needs beyond free collateral, plus 1 % for fees', () => {
    expect(collateralShortfall('1000', '860.79')).toBe('140.61') // 139.21 × 1.01, rounded up
    expect(collateralShortfall('500', '860.79')).toBeNull()
  })
})
