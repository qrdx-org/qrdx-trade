import { describe, expect, it } from 'vitest'
import { dec, str } from '../../lib/decimal'
import { fromHistoryTrade, orientFill, replaySpot, type SpotFill } from '../../lib/server/pnl'
import type { NodeHistoryTrade } from '../../lib/server/node'

const ME = '0xpqme'
let t = 0
const fill = (side: 'buy' | 'sell', price: string, amount: string): SpotFill => ({ time: 1000 + ++t, side, price: dec(price), amount: dec(amount) })

describe('spot PnL replay (signed average cost)', () => {
  it('realizes the gain over the average cost on a sell', () => {
    const b = replaySpot([fill('buy', '2', '10'), fill('buy', '4', '10'), fill('sell', '5', '5')])
    // average cost 3; selling 5 at 5 realizes 10 (quote)
    expect(str(b.realized)).toBe('10')
    expect(str(b.pos)).toBe('15')
    expect(str(b.cost)).toBe('45')
    expect(b.wins).toBe(1)
    // after the sell: 15 held at 3, marked at 5
    expect(str(b.steps[2].realized)).toBe('10')
    expect(str(b.steps[2].open)).toBe('30')
  })

  it('realizes a loss when the round trip lost', () => {
    const b = replaySpot([fill('buy', '1', '4'), fill('sell', '0.5', '4')])
    expect(str(b.realized)).toBe('-2')
    expect(b.losses).toBe(1)
    expect(str(b.pos)).toBe('0')
    expect(str(b.cost)).toBe('0')
  })

  it('treats selling coins held from before as a short against holding them', () => {
    // Sold 3 at 9 with nothing bought here: short 3; bought 1 back at 1 realizes 8.
    const b = replaySpot([fill('sell', '9', '3'), fill('buy', '1', '1')])
    expect(str(b.realized)).toBe('8')
    expect(str(b.pos)).toBe('-2')
    expect(str(b.cost)).toBe('-18')
    // Open: 2 still sold at 9, marked at 1 → +16
    expect(str(b.steps[1].open)).toBe('16')
  })

  it('flips through zero: the rest opens the other way at the trade price', () => {
    const b = replaySpot([fill('buy', '2', '1'), fill('sell', '3', '4')])
    expect(str(b.realized)).toBe('1')
    expect(str(b.pos)).toBe('-3')
    expect(str(b.cost)).toBe('-9')
  })
})

describe('spot fills as the market is shown', () => {
  it('turns a buy of token0 on an inverted pair into a sell of the base', () => {
    // QRDX/USDC on testnet: the node's pair is USDC:QRDX, priced in QRDX per USDC.
    const f = orientFill({ time: 1, side: 'buy', price: '0.00125', amount: '80000' }, true)
    expect(f.side).toBe('sell')
    expect(str(f.price)).toBe('800')
    expect(str(f.amount)).toBe('100')
  })

  it('reads the account side from a history row, and skips perps and self-trades', () => {
    const row = {
      block_time: 1794716335,
      market: '0xa0ad4f35bf2d518a62ebb7e39a32a8f791703362:QRDX',
      price: '0.00122214187583471304',
      amount: '81823.560731605572976985',
      side: 'buy',
      buyer: '0xPQME',
      seller: '0xPOOL1272a1de28623113c0b680f4ce6b00429b5a',
    } as NodeHistoryTrade
    expect(fromHistoryTrade(row, ME)).toMatchObject({ side: 'buy', amount: '81823.560731605572976985' })
    expect(fromHistoryTrade({ ...row, buyer: '0xother', seller: '0xpqme' }, ME)?.side).toBe('sell')
    expect(fromHistoryTrade({ ...row, seller: '0xPQME' }, ME)).toBeNull()
    expect(fromHistoryTrade({ ...row, market: 'BTC-USD-PERP' }, ME)).toBeNull()
  })
})
