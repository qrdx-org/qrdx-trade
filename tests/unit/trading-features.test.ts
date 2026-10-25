/** Trigger orders, TWAPs, atomic routes and the network's pool costs (qrdx-node docs/TRADING_FEATURES.md, TOKENOMICS.md). */
import { describe, expect, it } from 'vitest'
import { perpTriggerKind, protectiveLegError, spotTriggerParams, triggerGas, twapPlan } from '@/lib/orders'
import { routePathOp } from '@/lib/routing'
import { poolTypes } from '@/lib/launch'
import type { ApiAsset } from '@/lib/types'

const USDC = '0x2a8f3d5cbfc77e2913ca8aaf1d4009ad3bf11ca7'
const ETH = '0x5f36765059df36d522fa815429c5777105733417'
const asset = (address: string, symbol = '') => ({ address, symbol }) as unknown as ApiAsset

describe('spot stop orders', () => {
  it('signs a stop in the market orientation as is', () => {
    const m = { base: asset(ETH), quote: asset(USDC), inverted: false }
    expect(spotTriggerParams(m, 'sell', 'stop_loss', '2000', '1.5')).toEqual({
      pair: `${ETH}:${USDC}`,
      side: 'sell',
      order_type: 'stop_loss',
      trigger_price: '2000',
      amount: '1.5',
    })
  })

  it('flips the side and inverts the prices on an inverted market, keeping the kind', () => {
    // ETH/USDC shown, but the node's pair is USDC:ETH: selling ETH is buying USDC.
    const m = { base: asset(ETH), quote: asset(USDC), inverted: true }
    const p = spotTriggerParams(m, 'sell', 'stop_loss', '2000', '1.5', '1900')
    expect(p.pair).toBe(`${USDC}:${ETH}`)
    expect(p.side).toBe('buy')
    expect(p.order_type).toBe('stop_loss')
    expect(p.trigger_price).toBe('0.0005')
    // 1.5 ETH at the 1,900 limit is 2,850 USDC of token0.
    expect(p.amount).toBe('2850')
    expect(p.price).toBe('0.000526315789473684')
  })
})

describe('perp triggers', () => {
  it('names a stop by where it sits against the mark', () => {
    expect(perpTriggerKind('sell', '90', '100')).toBe('sl')
    expect(perpTriggerKind('sell', '110', '100')).toBe('tp')
    expect(perpTriggerKind('buy', '110', '100')).toBe('sl')
    expect(perpTriggerKind('buy', '90', '100')).toBe('tp')
  })

  it('checks a position TP/SL is on the right side of the mark', () => {
    expect(protectiveLegError(true, 'tp', '110', '100')).toBeNull()
    expect(protectiveLegError(true, 'sl', '90', '100')).toBeNull()
    expect(protectiveLegError(true, 'sl', '110', '100')).toMatch(/below the mark/)
    expect(protectiveLegError(false, 'tp', '110', '100')).toMatch(/below the mark/)
    expect(protectiveLegError(false, 'sl', '110', '100')).toBeNull()
    expect(protectiveLegError(true, 'tp', '100', '100')).toMatch(/above/)
  })

  it('prepays a trigger’s and a TWAP’s matching', () => {
    expect(triggerGas()).toBe(240_000)
    // A 30-minute TWAP: 60 slices at 5 makers is the doc's 3.64M gas.
    expect(twapPlan(30 * 60)).toEqual({ slices: 60, gas: 3_640_000 })
    expect(twapPlan(60).slices).toBe(2)
  })
})

describe('atomic routes', () => {
  it('signs one SWAP through the path, with the slippage taken once at the end', () => {
    const A = asset('0x' + '11'.repeat(20), 'A')
    const B = asset('0x' + '22'.repeat(20), 'B')
    const C = asset('0x' + '33'.repeat(20), 'C')
    const { op, minOut } = routePathOp(
      [
        { from: A, to: B, amountOut: '50' },
        { from: B, to: C, amountOut: '200' },
      ],
      '10',
      1,
      123
    )
    expect(op.params.path).toEqual([A.address, B.address, C.address])
    expect(op.params.amount_in).toBe('10')
    expect(minOut).toBe('198')
    expect(op.params.min_amount_out).toBe('198')
  })
})

describe('pool costs', () => {
  it('labels each pool type with what this network charges', () => {
    const t = poolTypes({ poolBurnSubsidized: '10', poolStakeStandard: '25' })
    expect(t.map((p) => [p.type, p.qrdx, p.label])).toEqual([
      ['SUBSIDIZED', '10', 'Burn 10 QRDX'],
      ['STANDARD', '25', 'Stake 25 QRDX'],
    ])
    expect(poolTypes({ poolBurnSubsidized: '', poolStakeStandard: '' })[0].qrdx).toBe('')
  })
})

describe('the perps order grid', () => {
  it('rounds prices to 5 significant figures and 6 − szDecimals decimals', async () => {
    const { gridPrice, gridPriceError, gridSizeError } = await import('@/lib/perps')
    expect(gridPrice('84957.5', 4)).toBe('84958')
    expect(gridPrice('84957.5', 4, 'down')).toBe('84957')
    expect(gridPrice('2642.375', 4)).toBe('2642.4')
    expect(gridPrice('0.123456', 4)).toBe('0.12')
    expect(gridPrice('0.0123456', 2)).toBe('0.0123')
    expect(gridPrice('99999.6', 4, 'up')).toBe('100000')
    // No grid (an older node): two decimals, as before.
    expect(gridPrice('84957.555', null)).toBe('84957.56')
    expect(gridPriceError('84957.5', 4, 'BTC-USD-PERP')).toMatch(/try 84958/)
    expect(gridPriceError('84957', 4, 'BTC-USD-PERP')).toBeNull()
    expect(gridSizeError('0.00001', 4, 'BTC-USD-PERP')).toMatch(/4 decimals/)
    expect(gridSizeError('0.0001', 4, 'BTC-USD-PERP')).toBeNull()
  })
})
