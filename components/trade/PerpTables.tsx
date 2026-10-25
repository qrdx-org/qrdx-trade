'use client'

import Link from 'next/link'
import { useState } from 'react'
import { dec, str } from '@/lib/decimal'
import { fixed, price as fmtPrice, size as fmtSize, tone } from '@/lib/format'
import type { AccountResponse } from '@/lib/types'
import { useWallet } from '@/lib/wallet/WalletContext'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { protectiveLegError, triggerGas } from '@/lib/orders'
import { gridPrice, gridPriceError } from '@/lib/perps'
import { cn } from '@/lib/utils'
import { AmendOrder, CancelAll, useSequence } from '@/components/trade/OrderManage'
import { X } from 'lucide-react'

/**
 * The grid a close order's price is rounded to without the market's own: 5 significant figures
 * and 2 decimals fit a market of up to 4 size decimals, the node's default.
 */
const CLOSE_GRID = 4

const pathFor = (marketId: string) => {
  const [base, quote] = marketId.split('-')
  return `/perps/${base.toLowerCase()}/${(quote ?? 'usd').toLowerCase()}`
}

export function PositionsTable({ account }: { account: AccountResponse | null }) {
  const w = useWallet()
  const { trading } = useFeatures()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!account) return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
  const rows = Object.entries(account.perp?.positions ?? {}).filter(([, p]) => dec(p.size) !== 0n)
  if (!rows.length) return <p className="p-6 text-center text-xs text-muted-foreground">No open positions.</p>

  /** Close with a reduce-only IOC 2 % through the mark: fills against the book, never flips. */
  const close = async (marketId: string, size: string, mark: string) => {
    const long = dec(size) > 0n
    const px = (dec(mark) * (long ? 98n : 102n)) / 100n
    setBusy(marketId)
    setErr(null)
    try {
      await w.sendExchange({
        op: 'PERP_ORDER',
        params: {
          market_id: marketId,
          side: long ? 'sell' : 'buy',
          size: size.replace('-', ''),
          // On any market's grid (5 significant figures fit every sz_decimals the node allows here).
          price: gridPrice(str(px), CLOSE_GRID, long ? 'down' : 'up'),
          reduce_only: true,
          tif: 'ioc',
        },
        label: `Close ${marketId} ${size}`,
        market: marketId,
      })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {err && <p className="px-3 py-1 text-xs text-ask">{err}</p>}
      <table className="w-full text-xs tabular">
        <thead className="text-muted-foreground">
          <tr className="text-right">
            <th className="px-3 py-1 text-left font-normal">Market</th>
            <th className="px-3 py-1 font-normal">Size</th>
            <th className="px-3 py-1 font-normal">Entry</th>
            <th className="px-3 py-1 font-normal">Mark</th>
            <th className="px-3 py-1 font-normal">PnL</th>
            <th className="px-3 py-1 font-normal">Liq. price</th>
            <th className="px-3 py-1 font-normal hidden md:table-cell">Leverage</th>
            {trading && <th className="px-3 py-1 font-normal">TP / SL</th>}
            <th className="px-3 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, p]) => (
            <tr key={id} className="border-t text-right">
              <td className="px-3 py-1.5 text-left">
                <Link href={pathFor(id)} className="hover:underline">{id}</Link>
              </td>
              <td className={cn('px-3 py-1.5', dec(p.size) > 0n ? 'text-bid' : 'text-ask')}>{fmtSize(p.size)}</td>
              <td className="px-3 py-1.5">{fmtPrice(p.entry_price)}</td>
              <td className="px-3 py-1.5">{fmtPrice(p.mark_price)}</td>
              <td className={cn('px-3 py-1.5', tone(p.unrealized_pnl))}>{fixed(p.unrealized_pnl, 2)}</td>
              <td className="px-3 py-1.5" title="Estimate: other positions held at their current marks">{fmtPrice(p.liquidation_price)}</td>
              <td className="px-3 py-1.5 hidden md:table-cell">
                {fixed(p.leverage, 1)}× {p.isolated ? 'iso' : 'cross'}
                {trading && p.isolated && <IsolatedMargin marketId={id} margin={p.isolated_margin} />}
              </td>
              {trading && (
                <td className="relative px-3 py-1.5">
                  <PositionTpSl account={account} marketId={id} size={p.size} mark={p.mark_price} />
                </td>
              )}
              <td className="px-3 py-1.5">
                <button onClick={() => close(id, p.size, p.mark_price)} disabled={busy === id} className="rounded border px-2 py-0.5 hover:bg-accent disabled:opacity-50">
                  {busy === id ? '…' : 'Close'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function PerpOrdersTable({ account }: { account: AccountResponse | null }) {
  const seq = useSequence()
  const { trading } = useFeatures()
  const [busy, setBusy] = useState<string | null>(null)
  if (!account) return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
  const orders = account.perp?.orders ?? []
  if (!orders.length) return <p className="p-6 text-center text-xs text-muted-foreground">No open orders.</p>
  type Order = (typeof orders)[number]
  const cancelReq = (o: Order) => ({
    op: 'PERP_CANCEL',
    params: { market_id: o.market_id, order_id: o.order_id },
    label: `Cancel ${o.market_id} ${o.side} ${o.size} @ ${o.price}`,
    market: o.market_id,
  })
  const cancel = async (o: Order) => {
    setBusy(o.order_id)
    await seq.run([cancelReq(o)])
    setBusy(null)
  }
  const amend = async (o: Order, price: string, size: string) => {
    setBusy(o.order_id)
    // PERP_MODIFY: `size` is what should be left; a smaller size at the same price keeps the queue.
    if (trading) {
      await seq.run([
        {
          op: 'PERP_MODIFY',
          params: { market_id: o.market_id, order_id: o.order_id, size, price },
          label: `Change ${o.market_id} ${o.side} to ${size} @ ${price}`,
          market: o.market_id,
        },
      ])
      setBusy(null)
      return
    }
    await seq.run([
      cancelReq(o),
      {
        op: 'PERP_ORDER',
        params: { market_id: o.market_id, side: o.side, size, price, ...(o.reduce_only ? { reduce_only: true } : {}) },
        label: `${o.side === 'buy' ? 'Long' : 'Short'} ${size} ${o.market_id} @ ${price} (replaces ${o.order_id.slice(0, 8)})`,
        market: o.market_id,
      },
    ])
    setBusy(null)
  }
  return (
    <>
      {(seq.error || orders.length > 1) && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5">
          <span className="text-xs text-ask">{seq.error}</span>
          <CancelAll
            count={orders.length}
            busy={busy === '*' ? seq.progress : null}
            onConfirm={async () => {
              setBusy('*')
              await seq.run(orders.map(cancelReq), `Cancel ${orders.length} perps orders`)
              setBusy(null)
            }}
          />
        </div>
      )}
      <table className="w-full text-xs tabular">
        <thead className="text-muted-foreground">
          <tr className="text-right">
            <th className="px-3 py-1 text-left font-normal">Market</th>
            <th className="px-3 py-1 text-left font-normal">Side</th>
            <th className="px-3 py-1 font-normal">Price</th>
            <th className="px-3 py-1 font-normal">Size</th>
            <th className="px-3 py-1 font-normal">Filled</th>
            <th className="px-3 py-1 font-normal">Reduce only</th>
            <th className="px-3 py-1" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.order_id} className="border-t text-right">
              <td className="px-3 py-1.5 text-left">{o.market_id}</td>
              <td className={cn('px-3 py-1.5 text-left', o.side === 'buy' ? 'text-bid' : 'text-ask')}>{o.side === 'buy' ? 'Long' : 'Short'}</td>
              <td className="px-3 py-1.5">{fmtPrice(o.price)}</td>
              <td className="px-3 py-1.5">{fmtSize(o.size)}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{fmtSize(o.filled)}</td>
              <td className="px-3 py-1.5">{o.reduce_only ? 'Yes' : 'No'}</td>
              <td className="relative px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <AmendOrder price={o.price} size={o.remaining} sizeLabel="Size" busy={!!busy} onSubmit={(p, sz) => void amend(o, p, sz)} />
                  <button onClick={() => cancel(o)} disabled={!!busy} className="rounded border px-2 py-0.5 hover:bg-accent disabled:opacity-50">
                    {busy === o.order_id ? '…' : 'Cancel'}
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/**
 * A position's take profit and stop loss: PERP_TRIGGER with `position: true`, which closes the
 * whole position whatever its size when it fires, and goes once there is none. Shows the ones
 * waiting; sets either or both with one approval.
 */
function PositionTpSl({ account, marketId, size, mark }: { account: AccountResponse; marketId: string; size: string; mark: string }) {
  const w = useWallet()
  const long = dec(size) > 0n
  const mine = (account.triggers ?? []).filter((t) => t.kindOf === 'perp' && t.market === marketId && t.size === 'position')
  const tpNow = mine.find((t) => t.kind === 'tp')
  const slNow = mine.find((t) => t.kind === 'sl')
  const [open, setOpen] = useState(false)
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const problem = (() => {
    if (!tp && !sl) return 'Enter a take profit, a stop loss, or both.'
    return (
      (tp && (protectiveLegError(long, 'tp', tp, mark) || gridPriceError(tp, CLOSE_GRID, marketId))) ||
      (sl && (protectiveLegError(long, 'sl', sl, mark) || gridPriceError(sl, CLOSE_GRID, marketId))) ||
      null
    )
  })()
  const submit = async () => {
    if (problem) return
    setBusy(true)
    setErr(null)
    const leg = (kind: 'tp' | 'sl', price: string) => ({
      op: 'PERP_TRIGGER',
      params: { market_id: marketId, side: long ? 'sell' : 'buy', kind, trigger_price: price, position: true, reduce_only: true },
      gasLimit: triggerGas() + 60_000,
      label: `${kind === 'tp' ? 'Take profit' : 'Stop loss'} ${marketId} @ ${price}`,
      market: marketId,
    })
    // A new one replaces the waiting one of its kind: cancel that first, in the same batch.
    const cancel = (t: typeof tpNow) => (t ? [{ op: 'PERP_CANCEL', params: { market_id: marketId, order_id: t.orderId }, label: `Cancel ${t.kind} ${marketId}` }] : [])
    const ops = [...(tp ? [...cancel(tpNow), leg('tp', tp)] : []), ...(sl ? [...cancel(slNow), leg('sl', sl)] : [])]
    try {
      if (ops.length === 1) await w.sendExchange(ops[0])
      else await w.sendExchangeBatch({ ops, label: `${marketId} position TP / SL`, market: marketId })
      setOpen(false)
      setTp('')
      setSl('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded border px-2 py-0.5 text-[11px] hover:bg-accent" title="Set the position's take profit and stop loss">
        {tpNow || slNow ? (
          <span className="num">
            <span className="text-bid">{tpNow ? fmtPrice(tpNow.triggerPrice) : '—'}</span> / <span className="text-ask">{slNow ? fmtPrice(slNow.triggerPrice) : '—'}</span>
          </span>
        ) : (
          'Set'
        )}
      </button>
      {open && (
        <div className="absolute right-2 z-20 mt-1 w-64 rounded-lg border bg-popover p-3 text-left shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold">{marketId} TP / SL</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mb-2 text-[10px] text-muted-foreground">Mark {fmtPrice(mark)}. Each closes the whole position when the mark reaches it, as a market order at most 10 % through.</p>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Take profit {tpNow && <span>(now {fmtPrice(tpNow.triggerPrice)})</span>}
            <input value={tp} onChange={(e) => setTp(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={long ? 'above mark' : 'below mark'} className="num mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground" />
          </label>
          <label className="mb-2 block text-[11px] text-muted-foreground">
            Stop loss {slNow && <span>(now {fmtPrice(slNow.triggerPrice)})</span>}
            <input value={sl} onChange={(e) => setSl(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={long ? 'below mark' : 'above mark'} className="num mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground" />
          </label>
          {(problem && (tp || sl)) || err ? <p className="mb-2 text-[10px] text-ask">{err ?? problem}</p> : null}
          <button type="button" disabled={!!problem || busy} onClick={() => void submit()} className="h-8 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? 'Confirm in wallet…' : 'Set TP / SL'}
          </button>
        </div>
      )}
    </>
  )
}

/** Add margin to an isolated position, or take some back (PERP_ISOLATED_MARGIN, negative removes). */
function IsolatedMargin({ marketId, margin }: { marketId: string; margin: string }) {
  const w = useWallet()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const go = async (sign: 1 | -1) => {
    if (!/^\d*\.?\d+$/.test(amount) || Number(amount) <= 0) return setErr('Enter an amount.')
    setBusy(true)
    setErr(null)
    try {
      await w.sendExchange({
        op: 'PERP_ISOLATED_MARGIN',
        params: { market_id: marketId, amount: sign < 0 ? `-${amount}` : amount },
        label: `${sign < 0 ? 'Remove' : 'Add'} ${amount} isolated margin ${marketId}`,
        market: marketId,
      })
      setOpen(false)
      setAmount('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="relative ml-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground" title="Add or remove isolated margin">
        {fixed(margin, 2)}
      </button>
      {open && (
        <span className="absolute right-0 z-20 mt-1 block w-56 rounded-lg border bg-popover p-3 text-left shadow-xl">
          <span className="mb-1 block text-[11px] text-muted-foreground">Isolated margin {fixed(margin, 2)}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Amount" className="num h-8 w-full rounded-md border bg-background px-2 text-xs" />
          {err && <span className="mt-1 block text-[10px] text-ask">{err}</span>}
          <span className="mt-2 flex gap-1">
            <button type="button" disabled={busy} onClick={() => void go(1)} className="h-7 flex-1 rounded-md border text-xs hover:bg-accent disabled:opacity-50">Add</button>
            <button type="button" disabled={busy} onClick={() => void go(-1)} className="h-7 flex-1 rounded-md border text-xs hover:bg-accent disabled:opacity-50">Remove</button>
          </span>
        </span>
      )}
    </span>
  )
}
