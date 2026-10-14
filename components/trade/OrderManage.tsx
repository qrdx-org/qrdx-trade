'use client'

import { useState } from 'react'
import { Pencil, X } from 'lucide-react'
import type { ExchangeRequest } from '@/lib/wallet/WalletContext'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/**
 * Several exchange operations, one after another: each is its own signed transaction (the
 * node has no batch operation), so the wallet asks for each. Consecutive nonces put them in
 * order, and a block applies them in that order.
 */
export function useSequence() {
  const w = useWallet()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (requests: ExchangeRequest[]): Promise<boolean> => {
    setError(null)
    setProgress({ done: 0, total: requests.length })
    try {
      for (let i = 0; i < requests.length; i++) {
        await w.sendExchange(requests[i])
        setProgress({ done: i + 1, total: requests.length })
      }
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setProgress(null)
    }
  }
  return { run, progress, error, setError }
}

/** "Cancel all", asking once before it starts. */
export function CancelAll({ count, onConfirm, busy }: { count: number; onConfirm: () => void; busy: { done: number; total: number } | null }) {
  const [asking, setAsking] = useState(false)
  if (count < 2) return null
  if (busy)
    return (
      <span className="text-[11px] text-muted-foreground">
        Cancelling {busy.done + 1} of {busy.total}…
      </span>
    )
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="rounded-md border px-2.5 py-0.5 text-[11px] font-medium hover:border-ask/50 hover:text-ask">
        Cancel all ({count})
      </button>
    )
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">Cancel {count} orders? Your wallet asks to sign each.</span>
      <button type="button" onClick={() => (setAsking(false), onConfirm())} className="rounded-md bg-ask px-2 py-0.5 font-medium text-white">
        Cancel all
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-md border px-2 py-0.5">
        Keep
      </button>
    </span>
  )
}

/**
 * Edit an open order's price and size. The node has no amend operation, so it is replaced:
 * cancelled, then placed again at the new terms, in one signing sequence. The new order joins
 * the back of the queue at its price, and if the cancel lands but the new order is refused,
 * no order is left.
 */
export function AmendOrder({
  price,
  size,
  sizeLabel,
  onSubmit,
  busy,
}: {
  price: string
  size: string
  sizeLabel: string
  onSubmit: (price: string, size: string) => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [p, setP] = useState(price)
  const [s, setS] = useState(size)
  const valid = /^\d*\.?\d+$/.test(p) && Number(p) > 0 && /^\d*\.?\d+$/.test(s) && Number(s) > 0
  const changed = p !== price || s !== size
  if (!open)
    return (
      <button type="button" onClick={() => (setP(price), setS(size), setOpen(true))} disabled={busy} aria-label="Edit order" title="Edit price or size" className="rounded-md border p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
        <Pencil className="h-3 w-3" />
      </button>
    )
  return (
    <div className="absolute right-2 z-20 mt-1 w-64 rounded-lg border bg-popover p-3 text-left shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">Edit order</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <label className="mb-1 block text-[11px] text-muted-foreground">
        Price
        <input value={p} onChange={(e) => setP(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="num mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground" />
      </label>
      <label className="mb-2 block text-[11px] text-muted-foreground">
        {sizeLabel}
        <input value={s} onChange={(e) => setS(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="num mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground" />
      </label>
      <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
        Replaces the order: it is cancelled, then placed again at these terms (two signatures). It loses its place in the queue.
      </p>
      <button
        type="button"
        disabled={!valid || !changed || busy}
        onClick={() => (setOpen(false), onSubmit(p, s))}
        className={cn('h-8 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50')}
      >
        Replace order
      </button>
    </div>
  )
}
