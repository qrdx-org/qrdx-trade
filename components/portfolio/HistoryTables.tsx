'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/hooks/useApi'
import { fixed, price as fmtPrice, size as fmtSize, timeAgo, tone } from '@/lib/format'
import { useNet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

interface TradeRow {
  block_time: number
  market: string
  venue: string
  kind: string
  price: string
  amount: string
  side: 'buy' | 'sell'
  role?: string
  account_side?: string
  fee?: string | null
  account_realized?: string | null
  tx_hash: string | null
  cursor: string
}
interface OrderRow {
  block_time: number
  market: string
  order_id: string
  event: string
  detail: Record<string, unknown> | null
  tx_hash: string | null
  cursor: string
}
interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/** Pages of /accounts/{address}/history (the node's trading history), newest first, with "load more". */
function useHistory<T>(address: string, kind: 'trades' | 'orders') {
  const { apiBase } = useNet()
  const [rows, setRows] = useState<T[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = async (cursor: string | null) => {
    try {
      const { data } = await apiGet<Page<T>>(`${apiBase}/accounts/${address}/history?kind=${kind}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      setRows((r) => (cursor ? [...(r ?? []), ...data.items] : data.items))
      setNext(data.nextCursor)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    setRows(null)
    setError(null)
    void load(null)
  }, [address, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, error, more: next ? () => load(next) : null }
}

export function TradeHistoryTable({ address }: { address: string }) {
  const { rows, error, more } = useHistory<TradeRow>(address, 'trades')
  if (error) return <p className="p-6 text-center text-xs text-muted-foreground">{error}</p>
  if (!rows) return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
  if (!rows.length) return <p className="p-6 text-center text-xs text-muted-foreground">No trades yet.</p>
  return (
    <>
      <table className="num w-full text-xs">
        <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
          <tr className="text-right">
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-left font-medium">Market</th>
            <th className="px-3 py-2 text-left font-medium">Side</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-3 py-2 font-medium">Fee</th>
            <th className="px-3 py-2 font-medium">Realized</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const side = (t.account_side ?? t.side) as string
            return (
              <tr key={t.cursor} className="border-t text-right">
                <td className="px-3 py-1.5 text-left text-muted-foreground" title={new Date(t.block_time * 1000).toLocaleString()}>{timeAgo(t.block_time)}</td>
                <td className="px-3 py-1.5 text-left">
                  {t.market}
                  {t.kind && t.kind !== 'trade' && <span className="ml-1 text-[10px] text-muted-foreground">{t.kind.replace(/_/g, ' ')}</span>}
                </td>
                <td className={cn('px-3 py-1.5 text-left capitalize', side === 'buy' ? 'text-bid' : 'text-ask')}>
                  {side}
                  {t.role && <span className="ml-1 text-[10px] text-muted-foreground">{t.role}</span>}
                </td>
                <td className="px-3 py-1.5">{fmtPrice(t.price)}</td>
                <td className="px-3 py-1.5">{fmtSize(t.amount)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{t.fee ? fixed(t.fee, 4) : '—'}</td>
                <td className={cn('px-3 py-1.5', t.account_realized ? tone(t.account_realized) : '')}>{t.account_realized ? fixed(t.account_realized, 2) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {more && (
        <button type="button" onClick={() => void more()} className="w-full border-t py-2 text-xs text-muted-foreground hover:text-foreground">
          Load more
        </button>
      )}
    </>
  )
}

export function OrderHistoryTable({ address }: { address: string }) {
  const { rows, error, more } = useHistory<OrderRow>(address, 'orders')
  if (error) return <p className="p-6 text-center text-xs text-muted-foreground">{error}</p>
  if (!rows) return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
  if (!rows.length) return <p className="p-6 text-center text-xs text-muted-foreground">No orders yet.</p>
  const describe = (d: Record<string, unknown> | null) => {
    if (!d) return ''
    const bits = [d.side, d.size ?? d.amount, d.price ? `@ ${d.price}` : null, d.reason ?? d.error].filter(Boolean)
    return bits.map(String).join(' ')
  }
  return (
    <>
      <table className="num w-full text-xs">
        <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-left font-medium">Market</th>
            <th className="px-3 py-2 text-left font-medium">Event</th>
            <th className="px-3 py-2 text-left font-medium">Order</th>
            <th className="px-3 py-2 text-left font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.cursor} className="border-t">
              <td className="px-3 py-1.5 text-muted-foreground" title={new Date(o.block_time * 1000).toLocaleString()}>{timeAgo(o.block_time)}</td>
              <td className="px-3 py-1.5">{o.market}</td>
              <td className="px-3 py-1.5 capitalize">{o.event.replace(/_/g, ' ')}</td>
              <td className="px-3 py-1.5 font-mono text-muted-foreground">{o.order_id.slice(0, 10)}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{describe(o.detail)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more && (
        <button type="button" onClick={() => void more()} className="w-full border-t py-2 text-xs text-muted-foreground hover:text-foreground">
          Load more
        </button>
      )}
    </>
  )
}
