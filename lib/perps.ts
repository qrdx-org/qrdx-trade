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

