/**
 * Reads of the 2026-10 node's trading features beyond the account itself: who may trade for
 * an account (agents, sub-accounts), its fee tier and referral, its trading history, the
 * leaderboard and user vaults (qrdx-node docs/TRADING_FEATURES.md). Each answers 501 on a node
 * that predates them.
 */

import { ApiError, nowSec } from './http'
import { checkTraderAddress } from './accounts'
import type { Net } from './net'
import type { NodeUserVault } from './node'

const missing = (what: string) => new ApiError('not_implemented', `This network's node has no ${what} (qrdx-node's 2026-10 release adds it)`)

export async function accountControl(net: Net, address: string) {
  checkTraderAddress(address)
  const { node } = net
  const [agents, subaccounts, fees, vaults] = await Promise.all([
    node.agents(address),
    node.subaccounts(address),
    node.feeSchedule(address),
    node.userVaults(address),
  ])
  if (agents === null && subaccounts === null && fees === null) throw missing('agents, sub-accounts or fee tiers')
  return {
    address,
    agents: agents ?? [],
    subaccounts: subaccounts ?? [],
    /** Vaults it leads (a market's liquidity vault is the protocol's, not listed). */
    vaults: (vaults ?? []).filter((v) => !v.managed).map(vaultView),
    fees,
    source: 'node' as const,
    asOf: nowSec(),
  }
}

export async function accountHistory(net: Net, address: string, kind: string, opts: { market?: string; limit: number; cursor: string | null }) {
  checkTraderAddress(address)
  const { node } = net
  if (kind === 'trades') {
    const page = await node.historyTrades({ address, market: opts.market, limit: opts.limit, cursor: opts.cursor })
    if (!page) throw missing('trading history')
    return { kind, items: page.items, nextCursor: page.next_cursor, source: 'node' as const, asOf: nowSec() }
  }
  if (kind === 'orders') {
    const page = await node.historyOrders({ address, market: opts.market, limit: opts.limit, cursor: opts.cursor })
    if (!page) throw missing('order history')
    return { kind, items: page.items, nextCursor: page.next_cursor, source: 'node' as const, asOf: nowSec() }
  }
  throw new ApiError('bad_request', 'kind is trades or orders')
}

export async function leaderboard(net: Net, window: string, metric: string, limit: number) {
  if (!['day', 'week', 'month', 'all'].includes(window)) throw new ApiError('bad_request', 'window is day, week, month or all')
  if (!['pnl', 'volume'].includes(metric)) throw new ApiError('bad_request', 'metric is pnl or volume')
  const rows = await net.node.leaderboard(window, metric, Math.max(1, Math.min(100, limit)))
  if (!rows) throw missing('leaderboard')
  return { window, metric, rows, source: 'node' as const, asOf: nowSec() }
}

export function vaultView(v: NodeUserVault) {
  return {
    vault: v.vault,
    leader: v.leader,
    name: v.name,
    profitShare: v.profit_share,
    created: Number(v.created),
    /** A market's liquidity vault: quoted on that market's book by the protocol. */
    marketMakerFor: v.managed,
    nav: v.nav,
    totalShares: v.total_shares,
    shareValue: v.share_value,
    leaderShares: v.leader_shares,
    holders: v.holders,
    withdrawable: v.withdrawable,
    lockupSeconds: Number(v.lockup_seconds),
    positions: v.positions,
    holding: v.holding ?? null,
  }
}

export async function vaults(net: Net) {
  const list = await net.node.userVaults()
  if (!list) throw missing('user vaults')
  return { vaults: list.map(vaultView).sort((a, b) => Number(b.nav) - Number(a.nav)), source: 'node' as const, asOf: nowSec() }
}

export async function vault(net: Net, address: string, holder: string | null) {
  const v = await net.node.userVault(address, holder ?? undefined)
  if (!v) {
    if ((await net.node.userVaults()) === null) throw missing('user vaults')
    throw new ApiError('not_found', `No vault ${address}`)
  }
  return { ...vaultView(v), source: 'node' as const, asOf: nowSec() }
}
