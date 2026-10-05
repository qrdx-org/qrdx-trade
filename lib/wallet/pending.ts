'use client'

/**
 * Exchange transactions this browser submitted, tracked until a block includes
 * them. Blocks are ~180 s apart, so "submitted" and "executed" are separate
 * states the UI must show. Kept per trader address in localStorage, so a reload
 * keeps tracking. Kept per network: a testnet order never shows on mainnet.
 */

import { useCallback, useEffect, useState } from 'react'
import { type Slot, apiBase } from '../config'

export type PendingStatus = 'pending' | 'success' | 'failed'

export interface PendingTx {
  txHash: string
  op: string
  label: string
  market?: string
  submittedAt: number
  status: PendingStatus
  error?: string
  blockHeight?: number
  /** Fills / order id from the receipt, for display. */
  result?: Record<string, unknown>
}

const KEY = (address: string, slot: Slot) => `qrdx-trade:txs:${slot}:${address.toLowerCase()}`
const MAX = 100
const listeners = new Set<() => void>()

function load(address: string, slot: Slot): PendingTx[] {
  try {
    const raw = localStorage.getItem(KEY(address, slot))
    return raw ? (JSON.parse(raw) as PendingTx[]) : []
  } catch {
    return []
  }
}

function save(address: string, slot: Slot, txs: PendingTx[]) {
  try {
    localStorage.setItem(KEY(address, slot), JSON.stringify(txs.slice(0, MAX)))
  } catch {
    /* storage full or blocked: tracking stays in memory for this page */
  }
  listeners.forEach((l) => l())
}

export function addPending(address: string, slot: Slot, tx: Omit<PendingTx, 'status' | 'submittedAt'>) {
  save(address, slot, [{ ...tx, status: 'pending', submittedAt: Date.now() / 1000 }, ...load(address, slot)])
}

/** Listen for any change to the tracked list (e.g. to refresh balances when one executes). */
export function onPendingChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

interface Receipt {
  success: boolean
  error: string
  block_height: number
  data: Record<string, unknown>
}

/** The tracked list for an address; polls receipts of the pending ones. */
export function usePendingTxs(address: string | null, slot: Slot, intervalMs = 5_000) {
  const [txs, setTxs] = useState<PendingTx[]>([])

  useEffect(() => {
    if (!address) {
      setTxs([])
      return
    }
    const sync = () => setTxs(load(address, slot))
    sync()
    return onPendingChange(sync)
  }, [address, slot])

  const poll = useCallback(async () => {
    if (!address) return
    const list = load(address, slot)
    const open = list.filter((t) => t.status === 'pending')
    if (!open.length) return
    let changed = false
    await Promise.all(
      open.map(async (t) => {
        const res = await fetch(`${apiBase(slot)}/receipts/${t.txHash}`, { cache: 'no-store' }).catch(() => null)
        if (!res || !res.ok) return
        const r = (await res.json()) as Receipt
        t.status = r.success ? 'success' : 'failed'
        t.error = r.error || undefined
        t.blockHeight = r.block_height
        t.result = r.data
        changed = true
      })
    )
    if (changed) save(address, slot, list)
  }, [address, slot])

  useEffect(() => {
    if (!address) return
    poll()
    const id = setInterval(poll, intervalMs)
    return () => clearInterval(id)
  }, [address, intervalMs, poll])

  const clearDone = useCallback(() => {
    if (address) save(address, slot, load(address, slot).filter((t) => t.status === 'pending'))
  }, [address, slot])

  return { txs, pending: txs.filter((t) => t.status === 'pending').length, clearDone }
}
