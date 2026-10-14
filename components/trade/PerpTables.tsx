'use client'

import Link from 'next/link'
import { useState } from 'react'
import { dec, round, str } from '@/lib/decimal'
import { fixed, price as fmtPrice, size as fmtSize, tone } from '@/lib/format'
import type { AccountResponse } from '@/lib/types'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'
import { AmendOrder, CancelAll, useSequence } from '@/components/trade/OrderManage'

const pathFor = (marketId: string) => {
  const [base, quote] = marketId.split('-')
  return `/perps/${base.toLowerCase()}/${(quote ?? 'usd').toLowerCase()}`
}

export function PositionsTable({ account }: { account: AccountResponse | null }) {
  const w = useWallet()
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
          price: round(str(px), 2, long ? 'down' : 'up'),
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
              </td>
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
              await seq.run(orders.map(cancelReq))
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
