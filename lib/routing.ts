/**
 * A routed swap as the operations to sign (lib/server/routing.ts quotes it). Each hop is its own
 * SWAP: hop 1 spends what was typed; each later hop spends the previous hop's minimum output,
 * which it is sure to have, and expects its quoted output scaled to that input. Every hop
 * refuses to fill below its own minimum (its expected output less the slippage).
 *
 * Whatever a hop delivers above its minimum is not spent by the next one: up to the slippage
 * of each intermediate token can stay in the account. And the hops are separate operations: if
 * one is refused, the ones before it stand.
 */

import { dec, div, lessSlippage, mul, round, str } from './decimal'
import type { RouteHop } from './server/routing'

export interface RouteOp {
  op: 'SWAP'
  params: { token_in: string; token_out: string; amount_in: string; min_amount_out: string; venue: 'auto'; deadline: number }
}

export function routeOps(hops: Pick<RouteHop, 'from' | 'to' | 'amountIn' | 'amountOut'>[], amountIn: string, slippagePct: number, deadline: number): { ops: RouteOp[]; minOut: string } {
  const ops: RouteOp[] = []
  let spend = amountIn
  for (const h of hops) {
    // The node's quote was for h.amountIn; this hop spends `spend`.
    const expected = str(mul(dec(h.amountOut), div(dec(spend), dec(h.amountIn))))
    const min = round(lessSlippage(expected, slippagePct), 18, 'down')
    ops.push({
      op: 'SWAP',
      params: { token_in: h.from.address!, token_out: h.to.address!, amount_in: spend, min_amount_out: min, venue: 'auto', deadline },
    })
    spend = min
  }
  return { ops, minOut: spend }
}
