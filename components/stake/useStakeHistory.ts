'use client'

import { useEffect, useState } from 'react'
import { dec, str } from '@/lib/decimal'
import { nodeGetPaced } from '@/lib/node-fetch'
import { useNet } from '@/lib/wallet/WalletContext'

export interface StakeEvent {
  time: number | null
  block: number
  tx: string
  op: 'STAKE_DELEGATE' | 'STAKE_UNDELEGATE'
  validator: string
  /** Delegations: QRDX; undelegations: pool shares redeemed. */
  amount: string
  ok: boolean
}

export interface StakeHistory {
  events: StakeEvent[]
  /** Per validator (lower-case): QRDX delegated, and whether any shares were redeemed since. */
  byValidator: Map<string, { delegated: string; undelegated: boolean }>
  /** The node's index reached the account's first operation. */
  complete: boolean
}

const PAGE = 500
const MAX_PAGES = 6

/**
 * The account's delegations and undelegations, from the node's transaction index. The node
 * keeps no per-epoch reward history; what was earned is the stake's value now against what
 * was put in, which holds until shares are redeemed (their payout value is not recorded).
 */
export function useStakeHistory(address: string | null, refresh: unknown): StakeHistory | null {
  const { network } = useNet()
  const [state, setState] = useState<{ key: string; history: StakeHistory } | null>(null)
  const key = `${network.nodeUrl}|${address}`

  useEffect(() => {
    if (!address) return
    let live = true
    ;(async () => {
      const events: StakeEvent[] = []
      let cursor: string | null = null
      let complete = false
      for (let i = 0; i < MAX_PAGES; i++) {
        const body = await nodeGetPaced<{ ok?: boolean; result?: { transactions: Row[]; next_cursor: string | null } }>(
          `${network.nodeUrl}/get_address_history?address=${encodeURIComponent(address)}&kinds=exchange&limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        )
        if (!body.ok || !body.result) return
        for (const r of body.result.transactions) {
          if ((r.op !== 'STAKE_DELEGATE' && r.op !== 'STAKE_UNDELEGATE') || !(r.roles ?? []).includes('sender')) continue
          const p = (r.detail?.params ?? {}) as Record<string, unknown>
          events.push({
            time: r.timestamp,
            block: r.block_height,
            tx: r.tx_hash,
            op: r.op,
            validator: String(p.validator ?? ''),
            amount: String(r.op === 'STAKE_DELEGATE' ? (p.amount ?? '0') : (p.shares ?? '0')),
            ok: r.status !== 'failed',
          })
        }
        cursor = body.result.next_cursor
        if (!cursor || body.result.transactions.length < PAGE) {
          complete = true
          break
        }
      }
      const byValidator = new Map<string, { delegated: string; undelegated: boolean }>()
      for (const e of [...events].reverse()) {
        if (!e.ok) continue
        const k = e.validator.toLowerCase()
        const cur = byValidator.get(k) ?? { delegated: '0', undelegated: false }
        if (e.op === 'STAKE_DELEGATE') cur.delegated = str(dec(cur.delegated) + dec(e.amount))
        else cur.undelegated = true
        byValidator.set(k, cur)
      }
      if (live) setState({ key, history: { events, byValidator, complete } })
    })().catch(() => undefined)
    return () => {
      live = false
    }
  }, [key, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return state?.key === key ? state.history : null
}

interface Row {
  block_height: number
  tx_hash: string
  timestamp: number | null
  op: string | null
  status: string | null
  detail: { params?: Record<string, unknown> } | null
  roles?: string[]
}
