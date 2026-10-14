/** Replacing an open order signs a new PLACE_ORDER from what the account API shows; it must match the original's orientation. */
import { describe, expect, it } from 'vitest'
import { orderMarket, spotLimitParams } from '@/lib/orders'
import type { ApiAsset } from '@/lib/types'

const USDC = '0x2a8f3d5cbfc77e2913ca8aaf1d4009ad3bf11ca7'
const ETH = '0x5f36765059df36d522fa815429c5777105733417'
const asset = (address: string) => ({ address }) as unknown as ApiAsset

describe('order replacement', () => {
  it('keeps a non-inverted order on its pair', () => {
    const m = orderMarket({ pair: `${USDC}:${ETH}`, base: asset(USDC), quote: asset(ETH) })
    expect(m.inverted).toBe(false)
    expect(spotLimitParams(m, 'buy', '0.0004', '100')).toEqual({ pair: `${USDC}:${ETH}`, side: 'buy', order_type: 'limit', price: '0.0004', amount: '100' })
  })

  it('re-inverts an order shown in market orientation', () => {
    // The node's pair puts USDC first; the market is ETH/USDC, so the order was shown inverted.
    const m = orderMarket({ pair: `${USDC}:${ETH}`, base: asset(ETH), quote: asset(USDC) })
    expect(m.inverted).toBe(true)
    const p = spotLimitParams(m, 'buy', '2500', '0.5')
    expect(p.pair).toBe(`${USDC}:${ETH}`)
    expect(p.side).toBe('sell')
    expect(p.amount).toBe('1250')
  })

  it('compares addresses without case', () => {
    expect(orderMarket({ pair: `QRDX:${USDC}`, base: asset('QRDX'), quote: asset(USDC.toUpperCase()) }).inverted).toBe(false)
  })
})
