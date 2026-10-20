import { describe, expect, it } from 'vitest'
import { paths } from '@/lib/server/routing'
import { routeOps } from '@/lib/routing'
import { dec } from '@/lib/decimal'

const g = (edges: [string, string][]) => {
  const m = new Map<string, Set<string>>()
  for (const [a, b] of edges) {
    if (!m.has(a)) m.set(a, new Set())
    if (!m.has(b)) m.set(b, new Set())
    m.get(a)!.add(b)
    m.get(b)!.add(a)
  }
  return m
}

describe('route search', () => {
  it('finds A → B → C → D when A and D share no market, shortest first', () => {
    const p = paths(g([['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'x'], ['x', 'd']]), 'a', 'd')
    expect(p[0]).toEqual(['a', 'x', 'd'])
    expect(p).toContainEqual(['a', 'b', 'c', 'd'])
  })
  it('stops at three hops and never revisits a token', () => {
    const p = paths(g([['a', 'b'], ['b', 'c'], ['c', 'e'], ['e', 'd'], ['b', 'a']]), 'a', 'd')
    expect(p).toEqual([])
  })
})

describe('route operations', () => {
  const asset = (address: string) => ({ address, symbol: address.toUpperCase() }) as never
  const hops = [
    { from: asset('a'), to: asset('b'), amountIn: '100', amountOut: '50' },
    { from: asset('b'), to: asset('c'), amountIn: '50', amountOut: '200' },
  ]
  it('spends each hop’s minimum in the next, and refuses below each hop’s own minimum', () => {
    const { ops, minOut } = routeOps(hops, '100', 1, 123)
    expect(ops[0].params).toMatchObject({ token_in: 'a', token_out: 'b', amount_in: '100', min_amount_out: '49.5', deadline: 123 })
    // hop 2 spends 49.5 of the 50 it was quoted for: expects 198, minimum 196.02
    expect(ops[1].params).toMatchObject({ token_in: 'b', token_out: 'c', amount_in: '49.5', min_amount_out: '196.02' })
    expect(minOut).toBe('196.02')
    expect(dec(minOut) < dec('200')).toBe(true)
  })
})
