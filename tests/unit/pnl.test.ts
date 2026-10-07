import { describe, expect, it } from 'vitest'
import { dec, str } from '../../lib/decimal'
import { replaySpot } from '../../lib/server/pnl'
import type { NodeMarketTrade } from '../../lib/server/node'

const ME = '0xpqme'
let seq = 0
const fill = (side: 'buy' | 'sell', price: string, amount: string, asTaker = true): NodeMarketTrade => ({
  seq: ++seq,
  market: 'a:b',
  price,
  amount,
  quote_amount: '0',
  side: asTaker ? side : side === 'buy' ? 'sell' : 'buy',
  venue: 'clob',
  block_height: seq,
  block_time: 1000 + seq,
  tx_hash: null,
  maker: asTaker ? '0xother' : ME,
  taker: asTaker ? ME : '0xother',
  pool_id: null,
})

describe('spot PnL replay (average cost)', () => {
  it('realizes the gain over the average cost on a sell', () => {
    const b = replaySpot([fill('buy', '2', '10'), fill('buy', '4', '10'), fill('sell', '5', '5')], ME, dec('2'))
    // average cost 3; selling 5 at 5 realizes 10 (quote), $20 at $2
    expect(str(b.realized)).toBe('10')
    expect(str(b.pos)).toBe('15')
    expect(str(b.cost)).toBe('45')
    expect(b.wins).toBe(1)
    expect(str(b.events[0].usd!)).toBe('20')
  })

  it('reads a maker fill from the other side of the taker', () => {
    // The taker sold into my bid: I bought.
    const b = replaySpot([fill('buy', '1', '4', false), fill('sell', '0.5', '4')], ME, null)
    expect(str(b.realized)).toBe('-2')
    expect(b.losses).toBe(1)
    expect(str(b.pos)).toBe('0')
    expect(b.events[0].usd).toBeNull()
  })

  it('realizes nothing on inventory bought before the window', () => {
    const b = replaySpot([fill('sell', '9', '3'), fill('buy', '1', '1'), fill('sell', '2', '3')], ME, dec('1'))
    expect(str(b.realized)).toBe('1')
    expect(str(b.pos)).toBe('0')
    expect(b.trades).toBe(3)
  })
})
