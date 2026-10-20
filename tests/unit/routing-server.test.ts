/** routeQuote over a stubbed node: the route that delivers the most wins, hop amounts chain. */
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/cache', () => ({ cached: (_k: string, _t: number, load: () => Promise<unknown>) => load() }))
const A = '0x' + 'a1'.repeat(20)
const B = '0x' + 'b2'.repeat(20)
const C = '0x' + 'c3'.repeat(20)
const D = '0x' + 'd4'.repeat(20)
const asset = (address: string, symbol: string) => ({ segment: address, slug: null, symbol, name: symbol, verified: false, address, onChainSymbol: symbol, decimals: 18, color: '#000', quoteRank: 0 })
vi.mock('@/lib/server/resolve', () => ({
  resolveSegment: async (_n: unknown, seg: string) => ({ ref: asset(seg, { [A]: 'A', [D]: 'D' }[seg] ?? '?') }),
  tokenIndex: async () => ({}),
  refForAddress: (addr: string) => asset(addr, { [B]: 'B', [C]: 'C' }[addr] ?? '?'),
}))
vi.mock('@/lib/server/market-data', () => ({ nodeTickers: async () => new Map() }))
vi.mock('@/lib/server/markets', () => ({ apiAsset: (r: unknown) => r }))

// Rates per edge (out per in), and no other markets: the direct A/D pool pays 1:1, the long way 1.2 overall.
const rate: Record<string, number> = { [`${A}>${D}`]: 1, [`${A}>${B}`]: 2, [`${B}>${C}`]: 3, [`${C}>${D}`]: 0.2 }
const pool = (t0: string, t1: string) => ({ pool_id: `${t0}:${t1}`, token0: t0, token1: t1, liquidity: '1000' })
const net = {
  key: (k: string) => k,
  node: {
    pools: async () => [pool(A, D), pool(A, B), pool(B, C), pool(C, D)],
    quoteSwap: async (tin: string, tout: string, amount: string) => {
      const r = rate[`${tin}>${tout}`]
      if (!r) return null
      const out = String(Number(amount) * r)
      return { source: 'amm', pool_id: `${tin}:${tout}`, amount_in: amount, amount_out: out, unfilled_in: '0', fee: '0.1', execution_price: String(1 / r), price_impact: '0.01' }
    },
  },
} as never

let routeQuote: typeof import('@/lib/server/routing').routeQuote
beforeAll(async () => {
  routeQuote = (await import('@/lib/server/routing')).routeQuote
})

describe('routeQuote', () => {
  it('takes A → B → C → D when it delivers more than the direct pool', async () => {
    const r = await routeQuote(net, A, D, '100', '')
    expect(r.hops.map((h) => h.to.symbol)).toEqual(['B', 'C', 'D'])
    expect(r.hops.map((h) => h.amountIn)).toEqual(['100', '200', '600'])
    expect(Number(r.amountOut)).toBeCloseTo(120)
    expect(r.directAmountOut).toBe('100')
    expect(Number(r.priceImpact)).toBeCloseTo(1 - 0.99 ** 3, 6)
  })
  it('keeps the direct pair when it pays at least as much', async () => {
    rate[`${A}>${D}`] = 1.5
    const r = await routeQuote(net, A, D, '100', '')
    expect(r.hops).toHaveLength(1)
    rate[`${A}>${D}`] = 1
  })
})
