/** Perps collateral helpers. Pure; shared by the order form and tests. */

import { dec, round, str } from './decimal'
import type { AccountResponse } from './types'

/**
 * How much of the collateral asset the wallet itself holds (native QRDX or the
 * collateral token), which can be deposited. Perps margin counts only what is
 * deposited into the clearinghouse.
 */
export function walletCollateral(account: AccountResponse | null): string | null {
  const t = account?.perp?.collateral_token
  if (!account || !t) return null
  return account.balances.find((b) => b.asset.address?.toLowerCase() === t.toLowerCase())?.balance ?? '0'
}

/** Deposit enough to cover `margin` beyond what is free, plus 1 % for fees, rounded up to 2 places. */
export function collateralShortfall(margin: string | null, free: string | null | undefined): string | null {
  if (!margin || !free || dec(margin) <= dec(free)) return null
  const need = ((dec(margin) - dec(free)) * 101n) / 100n
  return round(str(need), 2, 'up')
}


// ─── The order grid (Hyperliquid's szDecimals; qrdx-node clearinghouse._check_grid) ─────────
// A market with `szDecimals` (null: none, an older node) takes sizes in whole lots of
// 10^-szDecimals and prices of at most 5 significant figures and 6 − szDecimals decimals; an
// integer price always fits. Trigger and limit prices of triggers follow the same grid.

const PRICE_SIG_FIGS = 5
const MAX_PRICE_DECIMALS = 6

/** The decimals a price near `p` may have on this grid. */
function priceDecimals(p: string, szDecimals: number): number {
  const [whole, frac = ''] = p.replace(/^-/, '').split('.')
  const intDigits = whole.replace(/^0+/, '').length
  const cap = Math.max(0, MAX_PRICE_DECIMALS - szDecimals)
  if (intDigits >= PRICE_SIG_FIGS) return 0
  if (intDigits > 0) return Math.min(cap, PRICE_SIG_FIGS - intDigits)
  const zeros = (/^0*/.exec(frac)?.[0].length ?? 0)
  return Math.min(cap, zeros + PRICE_SIG_FIGS)
}

/** `p` rounded onto the market's price grid ('half' by default; 'up' / 'down' for limits). */
export function gridPrice(p: string, szDecimals: number | null | undefined, mode: 'half' | 'up' | 'down' = 'half'): string {
  if (szDecimals == null || szDecimals < 0) return round(p, 2, mode)
  const out = round(p, priceDecimals(p, szDecimals), mode)
  // Rounding up can add a digit (99,999.5 → 100,000): round once more at the new magnitude.
  return round(out, priceDecimals(out, szDecimals), mode)
}

/** Why `p` is off the market's price grid, with the nearest price that fits; null if it fits. */
export function gridPriceError(p: string, szDecimals: number | null | undefined, market: string): string | null {
  if (szDecimals == null || szDecimals < 0 || !/^\d*\.?\d+$/.test(p)) return null
  const fit = gridPrice(p, szDecimals)
  if (dec(fit) === dec(p)) return null
  return `${market} prices have at most ${PRICE_SIG_FIGS} significant figures and ${Math.max(0, MAX_PRICE_DECIMALS - szDecimals)} decimals: try ${fit}.`
}

/** Why `size` is not a whole number of lots; null if it is. */
export function gridSizeError(size: string, szDecimals: number | null | undefined, market: string): string | null {
  if (szDecimals == null || szDecimals < 0 || !/^\d*\.?\d+$/.test(size)) return null
  if (dec(round(size, szDecimals, 'down')) === dec(size)) return null
  return `${market} sizes have at most ${szDecimals} decimals.`
}
