/**
 * Recorded market history (relay/src/history.ts) and USD pricing through pools
 * (lib/server/usd.ts).
 */
import { describe, expect, it } from 'vitest'
import { buildCandles, changed, stats24h, traded, Sample } from '@/relay/src/history'
import { str } from '@/lib/decimal'
import { route } from '@/lib/server/usd'
import { orientHistoryCandle, historyMarketStats } from '@/lib/server/markets'
import type { TokenIndex } from '@/lib/server/resolve'
import type { NodePool, NodeToken } from '@/lib/server/node'
import type { IndexPrice } from '@/lib/types'

const s = (t: number, price: string, v0 = '0', v1 = '0'): Sample => ({ t, price, v0, v1 })

describe('history samples', () => {
  it('stores a sample only when something changed (or as an hourly heartbeat)', () => {
    expect(changed(undefined, s(60, '1'))).toBe(true)
    expect(changed(s(60, '1'), s(120, '1'))).toBe(false)
    expect(changed(s(60, '1'), s(120, '2'))).toBe(true)
    expect(changed(s(60, '1', '5'), s(120, '1', '6'))).toBe(true)
    expect(changed(s(60, '1'), s(60 + 3600, '1'))).toBe(true)
  })

  it('counts both directions: what was paid in, plus the other side at the mean pool price', () => {
    // 10 token0 sold in and 120 token1 bought in while the price went 10 → 12 (mean 11)
    const v = traded(s(0, '10', '100', '1000'), s(60, '12', '110', '1120'))
    expect(str(v.v0)).toBe('20.90909090909090909') // 10 + 120 / 11
    expect(str(v.v1)).toBe('230') // 120 + 10 × 11
    // a buy only (token1 in): token0 out valued at the mean price
    const buy = traded(s(0, '10', '100', '1000'), s(60, '10', '100', '1100'))
    expect([str(buy.v0), str(buy.v1)]).toEqual(['10', '100'])
  })

  it('builds OHLC from block-close samples, volume from counter deltas, and carries quiet buckets', () => {
    const rows = [s(3600, '10', '100', '1000'), s(3660, '12', '110', '1120'), s(3720, '9', '130', '1300'), s(7260, '11', '131', '1311')]
    const c = buildCandles(rows, undefined, 3600, 3 * 3600 + 59, 3600)
    // 3600→3660: 10 + 120/11 and 120 + 10×11; 3660→3720: 20 + 180/10.5 and 180 + 20×10.5
    expect(c[0]).toEqual({ t: 3600, o: '10', h: '12', l: '9', c: '9', v0: '58.051948051948051947', v1: '620' })
    // second bucket: one change, from close 9 to 11 (mean 10): 1 + 11/10 and 11 + 1×10
    expect(c[1]).toEqual({ t: 7200, o: '9', h: '11', l: '9', c: '11', v0: '2.1', v1: '21' })
    // third bucket: no change, flat at the close
    expect(c[2]).toEqual({ t: 10800, o: '11', h: '11', l: '11', c: '11', v0: '0', v1: '0' })
  })

  it('carries the last price from before the window into the first bucket', () => {
    const c = buildCandles([s(7300, '20', '5', '50')], s(100, '15', '1', '10'), 7200, 7319, 60)
    expect(c[0].o).toBe('15')
    expect(c.find((x) => x.t === 7260)?.c).toBe('20')
  })

  it('computes 24 h stats from the price a day ago and the volume since', () => {
    const st = stats24h(s(0, '10', '100', '1000'), [s(3600, '12', '150', '1600')], s(0, '10'))
    // 50 token0 and 600 token1 paid in, mean price 11
    expect(st).toMatchObject({ last: '12', open24h: '10', v0_24h: '104.545454545454545454', v1_24h: '1150' })
    expect(historyMarketStats(st, false)).toEqual({ change24h: '20', volume24h: '1150' })
    // inverted market: base is token1, price 1/p, quote volume is in token0
    expect(historyMarketStats(st, true)).toEqual({ change24h: '-16.67', volume24h: '104.545454545454545454' })
    expect(orientHistoryCandle({ t: 0, o: '2', h: '4', l: '1', c: '2', v0: '3', v1: '6' }, true)).toEqual({ t: 0, o: '0.5', h: '1', l: '0.25', c: '0.5', v: '6' })
  })
})

describe('USD through pools', () => {
  const MEME = '0x1000000000000000000000000000000000000001'
  const QRDX = '0x2000000000000000000000000000000000000002'
  const BTC = '0x3000000000000000000000000000000000000003'
  const tok = (a: string, symbol: string): NodeToken => ({
    token_address: a, name: symbol, symbol, decimals: 18, total_supply: '1', max_supply: null, mint_authority: null, freeze_authority: null, creator: '', created_height: 0,
  })
  const idx: TokenIndex = {
    byAddress: new Map([[MEME, tok(MEME, 'MEME')], [QRDX, tok(QRDX, 'WQRDX')], [BTC, tok(BTC, 'qBTC')]]),
    verified: new Map([['qrdx', tok(QRDX, 'WQRDX')], ['btc', tok(BTC, 'qBTC')]]),
    slugByAddress: new Map([[QRDX, 'qrdx'], [BTC, 'btc']]),
    nodeOk: true,
  }
  const pool = (id: string, token0: string, token1: string, price: string): NodePool =>
    ({ pool_id: id, token0, token1, price, liquidity: '1000', positions: 1, paused: false, fee_tier: 3000, fee_rate: '0.003' }) as unknown as NodePool
  const btcUsd: IndexPrice = { price: '80000', change24h: '1', high24h: null, low24h: null, volume24h: null, source: 'coinbase', asOf: 0 }

  it('prices a memecoin through QRDX and BTC to Coinbase BTC-USD, with the 24 h change of the route', () => {
    // MEME/QRDX: 0.5 QRDX per MEME (was 0.4); QRDX/BTC: 0.00001 BTC per QRDX (unchanged)
    const pools = [pool('p1', MEME, QRDX, '0.5'), pool('p2', QRDX, BTC, '0.00001')]
    const history = {
      p1: { last: '0.5', open24h: '0.4', v0_24h: '0', v1_24h: '0', firstAt: 0 },
      p2: { last: '0.00001', open24h: '0.00001', v0_24h: '0', v1_24h: '0', firstAt: 0 },
    }
    const q = route(idx, pools, history, { btc: btcUsd })
    expect(q.get(QRDX)?.price).toBe('0.8') // 0.00001 BTC × 80,000
    const meme = q.get(MEME)!
    expect(meme.price).toBe('0.4') // 0.5 QRDX × 0.8
    expect(meme.route).toEqual([MEME, 'qrdx', 'btc'])
    expect(meme.pools).toEqual(['p1', 'p2'])
    // 0.5/0.4 = 1.25 on the pool, × 1.01 for BTC → +26.25 %
    expect(meme.change24h).toBe('26.25')
  })

  it('works when the coin is token1 of its pool, and leaves unreachable coins unpriced', () => {
    const LONE = '0x0000000000000000000000000000000000000009'
    // QRDX/MEME with QRDX as token0: 2 MEME per QRDX → 0.5 QRDX per MEME
    const pools = [pool('p1', QRDX, MEME, '2'), pool('p2', QRDX, BTC, '0.00001')]
    const q = route(idx, pools, {}, { btc: btcUsd })
    expect(q.get(MEME)?.price).toBe('0.4')
    expect(q.get(MEME)?.change24h).toBeNull() // no recorded day for the pools
    expect(q.has(LONE)).toBe(false)
    expect(route(idx, [pool('p1', MEME, QRDX, '0.5')], {}, { btc: btcUsd }).has(MEME)).toBe(false) // no path to BTC
  })
})
