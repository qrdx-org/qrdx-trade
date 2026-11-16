/**
 * Sub-accounts (qrdx-node docs/TRADING_FEATURES.md): accounts with their own balances, margin and
 * orders, at addresses no key controls; the wallet account (their master) signs for them.
 */

import { blake2b } from '@noble/hashes/blake2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { AccountSummary } from './types'

export const SUBACCOUNT_RE = /^0xSUBA[0-9a-fA-F]{36}$/
export const VAULT_RE = /^0xUVLT[0-9a-fA-F]{36}$/
/** NAME_MAX (qrdx-node qrdx/exchange/trading.py). */
export const SUBACCOUNT_NAME_MAX = 32

/**
 * The address sub-account `index` of `master` gets (qrdx-node `subaccount_address`): known before
 * it exists, so one approval can create a sub-account and fund it. `master` exactly as the node
 * spells it (the hash is of the string).
 */
export function subaccountAddress(master: string, index: number): string {
  return '0xSUBA' + bytesToHex(blake2b(utf8ToBytes(`subaccount:${master}:${index}`), { dkLen: 18 }))
}

/** What an account is called on screen. */
export function accountName(a: Pick<AccountSummary, 'kind' | 'index' | 'name'>): string {
  if (a.kind === 'main') return 'Main account'
  if (a.kind === 'vault') return a.name ? `Vault ${a.name}` : 'Vault'
  return a.name || (a.index === null ? 'New sub-account' : `Sub-account ${a.index}`)
}

/** A short tag beside the name: "Sub #2" for a named sub-account, the kind otherwise. */
export function accountTag(a: Pick<AccountSummary, 'kind' | 'index' | 'name'>): string {
  if (a.kind === 'main') return 'Wallet'
  if (a.kind === 'vault') return 'Vault'
  return a.index === null ? 'Sub' : `Sub #${a.index}`
}
