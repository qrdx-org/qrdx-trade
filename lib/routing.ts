/**
 * A routed swap as the operations to sign (lib/server/routing.ts quotes it).
 *
 * On a node with multi-hop swaps (docs/TRADING_FEATURES.md §6) it is ONE SWAP with a `path`:
 * each hop spends exactly what the one before bought, and the whole swap is undone unless the
 * last hop delivers `min_amount_out` (routePathOp). Otherwise each hop is its own SWAP: hop 1 spends what was typed; each later hop spends the previous hop's minimum output,
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

export interface RoutePathOp {
  op: 'SWAP'
  params: { path: string[]; amount_in: string; min_amount_out: string; venue: 'auto'; deadline: number }
}

/** The most hops one SWAP `path` takes (qrdx-node MAX_SWAP_HOPS). */
export const MAX_PATH_HOPS = 4

/**
 * The route as one atomic SWAP: the slippage allowance applies once, to the final output,
 * and nothing is left in the intermediate tokens.
 */
export function routePathOp(hops: Pick<RouteHop, 'from' | 'to' | 'amountOut'>[], amountIn: string, slippagePct: number, deadline: number): { op: RoutePathOp; minOut: string } {
  const minOut = round(lessSlippage(hops[hops.length - 1].amountOut, slippagePct), 18, 'down')
  return {
    op: { op: 'SWAP', params: { path: [hops[0].from.address!, ...hops.map((h) => h.to.address!)], amount_in: amountIn, min_amount_out: minOut, venue: 'auto', deadline } },
    minOut,
  }
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
