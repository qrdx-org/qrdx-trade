/**
 * The fee reserve (qrdx-node qrdx/post_state.py, chain-spec FEE_RESERVE_QRDX, in force under
 * `two_block_deferral`): within a block nothing but fees takes an account below
 * min(reserve, its QRDX as the block began), so the fees of what it has already signed stay
 * payable. A transaction may spend through it only by signing `params.spend_reserve`, which
 * this site never sets: an account emptied of QRDX can sign nothing more.
 */

import { isNativeAsset } from './assets'
import { dec, str } from './decimal'

/** What of `balance` an order, swap or deposit can take: all of a token, QRDX less the reserve. */
export function spendable(balance: string, asset: string | null | undefined, reserve: string | null | undefined): string {
  if (!reserve || !isNativeAsset(asset)) return balance
  const left = dec(balance) - dec(reserve)
  return left > 0n ? str(left) : '0'
}

/** The node's refusal for touching the reserve, said for a person; any other error unchanged. */
export function explainNodeError(error: string): string {
  const m = /would keep less than its fee reserve \(([\d.]+) QRDX\)/.exec(error)
  return m ? `This would leave less than ${m[1]} QRDX in the wallet. The network keeps that much back so the account can always pay its fees.` : error
}
