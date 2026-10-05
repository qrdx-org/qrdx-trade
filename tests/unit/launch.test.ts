/**
 * Launch math: the token address the node will assign, and the one-sided curve
 * placement (which side of the price, tick alignment, and the deposit side).
 */
import { describe, expect, it } from 'vitest'
import { blake2b } from '@noble/hashes/blake2.js'
import { canonicalInitialPrice, decimalString, deployParams, deriveTokenAddress, launchCurve, validateLaunch } from '@/lib/launch'

const LOW = '0x0000000000000000000000000000000000000001'
const HIGH = '0xffffffffffffffffffffffffffffffffffffffff'

describe('deriveTokenAddress', () => {
  it('is blake2b-160 of "sender:nonce:symbol" (node derive_token_address)', () => {
    const sender = '0xPQ' + 'ab'.repeat(32)
    const expected =
      '0x' + Buffer.from(blake2b(new TextEncoder().encode(`${sender}:7:PEPE`), { dkLen: 20 })).toString('hex')
    expect(deriveTokenAddress(sender, 7, 'PEPE')).toBe(expected)
    // Computed by qrdx-node itself: scripts/local-node deploys PEPE from 0xPQcccc… at nonce 0.
    expect(deriveTokenAddress('0xPQ' + 'c'.repeat(64), 0, 'PEPE')).toBe('0x2ed3c723b9c72abae29a05f9182893f49716c26c')
    expect(deriveTokenAddress(sender, 8, 'PEPE')).not.toBe(deriveTokenAddress(sender, 7, 'PEPE'))
  })
})

describe('launchCurve', () => {
  const tickOf = (p: number) => Math.log(p) / Math.log(1.0001)

  it('token as token0: range above the opening price, deposit token0 only', () => {
    const c = launchCurve({ token: LOW, quote: HIGH, startPrice: 0.000001, multiple: 100, spacing: 200 })
    expect(c.tokenIsToken0).toBe(true)
    expect(c.depositSide).toBe('amount0')
    expect(Math.abs(c.tickLower % 200)).toBe(0)
    expect(Math.abs(c.tickUpper % 200)).toBe(0)
    // The pool opens strictly below the range (node: st.tick < tick_lower → token0 only).
    expect(Math.floor(tickOf(Number(c.initialPrice)))).toBeLessThan(c.tickLower)
    expect(c.startPrice).toBeGreaterThanOrEqual(0.000001)
    expect(c.startPrice).toBeLessThan(0.000001 * 1.03)
    expect(c.endPrice / c.startPrice).toBeGreaterThan(90)
  })

  it('token as token1: range below the opening price, deposit token1 only', () => {
    const c = launchCurve({ token: HIGH, quote: LOW, startPrice: 0.000001, multiple: 100, spacing: 200 })
    expect(c.tokenIsToken0).toBe(false)
    expect(c.depositSide).toBe('amount1')
    // Canonical price is token per quote; the pool opens at or above tick_upper (node: token1 only).
    expect(Math.floor(tickOf(Number(c.initialPrice)))).toBeGreaterThanOrEqual(c.tickUpper)
    // Rounded to a tick, the curve starts at or just above the requested price, as for token0.
    expect(c.startPrice).toBeGreaterThanOrEqual(0.000001 * 0.999999)
    expect(c.startPrice).toBeLessThan(0.000001 * 1.03)
  })

  it('refuses curves that collapse to nothing', () => {
    expect(() => launchCurve({ token: LOW, quote: HIGH, startPrice: 1, multiple: 1.001, spacing: 200 })).toThrow()
    expect(() => launchCurve({ token: LOW, quote: HIGH, startPrice: 0, multiple: 10, spacing: 200 })).toThrow()
  })
})

describe('helpers', () => {
  it('prints prices without exponents', () => {
    expect(decimalString(0.0000012345)).toBe('0.0000012345')
    expect(decimalString(123456789.5)).toBe('123456789.5')
  })
  it('orients a typed pool price to the sorted pair', () => {
    expect(canonicalInitialPrice(LOW, HIGH, '4')).toBe('4')
    expect(canonicalInitialPrice(HIGH, LOW, '4')).toBe('0.25')
  })
  it('applies the node token rules', () => {
    const ok = { name: 'Pepe', symbol: 'PEPE', supply: '1000000000', keep: '0', tokenOnly: false, mintAuthority: null, maxSupply: '' }
    expect(validateLaunch(ok)).toBeNull()
    expect(validateLaunch({ ...ok, symbol: 'PE PE' })).toMatch(/spaces/)
    expect(validateLaunch({ ...ok, symbol: 'A:B' })).toMatch(/spaces/)
    expect(validateLaunch({ ...ok, name: 'x'.repeat(65) })).toMatch(/name/)
    expect(validateLaunch({ ...ok, supply: '0' })).toMatch(/mint authority/)
  })

  it('lets the creator keep part of the supply, but not all of it, when there is a market', () => {
    const ok = { name: 'Pepe', symbol: 'PEPE', supply: '1000', keep: '250', tokenOnly: false, mintAuthority: null, maxSupply: '' }
    expect(validateLaunch(ok)).toBeNull()
    expect(validateLaunch({ ...ok, keep: '1000' })).toMatch(/Keep less/)
    expect(validateLaunch({ ...ok, keep: '1000', tokenOnly: true })).toBeNull()
  })

  it('takes an optional mint authority and cap, as the node does', () => {
    const me = '0xPQ' + 'ab'.repeat(32)
    const base = { name: 'Pepe', symbol: 'PEPE', supply: '1000', keep: '0', tokenOnly: true, mintAuthority: me, maxSupply: '' }
    expect(validateLaunch(base)).toBeNull()
    expect(validateLaunch({ ...base, supply: '0' })).toBeNull() // mintable: may start empty
    expect(validateLaunch({ ...base, mintAuthority: 'bob' })).toMatch(/0x/)
    expect(validateLaunch({ ...base, maxSupply: '500' })).toMatch(/below/)
    expect(validateLaunch({ ...base, mintAuthority: null, maxSupply: '5000' })).toMatch(/mintable/)
    expect(deployParams({ ...base, maxSupply: '5000' })).toEqual({
      name: 'Pepe', symbol: 'PEPE', decimals: 18, initial_supply: '1000', mint_authority: me, max_supply: '5000',
    })
    expect(deployParams({ ...base, mintAuthority: null })).not.toHaveProperty('mint_authority')
  })
})
