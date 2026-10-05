'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { fixed, price as fmtPrice, size as fmtSize, timeAgo } from '@/lib/format'
import type { AccountResponse } from '@/lib/types'
import { usePendingTxs } from '@/lib/wallet/pending'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

export type AccountTab = { id: string; label: string; render: () => React.ReactNode }

/** Tabbed panel under the chart. Spot and perps pass their own tabs; Transactions is shared. */
export function AccountPanel({ tabs }: { tabs: AccountTab[] }) {
  const w = useWallet()
  const { slot } = useNet()
  const { txs, pending } = usePendingTxs(w.trader, slot)
  const all: AccountTab[] = [
    ...tabs,
    {
      id: 'txs',
      label: `Transactions${pending ? ` (${pending})` : ''}`,
      render: () => <Transactions txs={txs} />,
    },
  ]
  const [tab, setTab] = useState(all[0].id)
  const current = all.find((t) => t.id === tab) ?? all[0]
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 overflow-x-auto border-b px-2 text-sm">
        {all.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-2 py-1.5',
              t.id === current.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {!w.trader ? <p className="p-6 text-center text-xs text-muted-foreground">Connect the QRDX Wallet to see your account.</p> : current.render()}
      </div>
    </div>
  )
}

export function BalancesTable({ account }: { account: AccountResponse | null }) {
  if (!account) return <Loading />
  return (
    <table className="w-full text-xs tabular">
      <thead className="text-muted-foreground">
        <tr className="text-right">
          <th className="px-3 py-1 text-left font-normal">Asset</th>
          <th className="px-3 py-1 font-normal">Available</th>
          <th className="px-3 py-1 font-normal">In orders</th>
          <th className="px-3 py-1 text-left font-normal hidden md:table-cell">Token</th>
        </tr>
      </thead>
      <tbody>
        {account.balances.map((b) => (
          <tr key={b.asset.segment} className="border-t text-right">
            <td className="px-3 py-1.5 text-left">
              <span className="flex items-center gap-2">
                <TokenBadge asset={b.asset} size="xs" />
                {b.asset.symbol}
                {!b.asset.verified && <span className="text-[10px] text-amber-500">unverified</span>}
              </span>
            </td>
            <td className="px-3 py-1.5">{fmtSize(b.balance)}</td>
            <td className="px-3 py-1.5 text-muted-foreground">{fmtSize(b.inOrders)}</td>
            <td className="px-3 py-1.5 text-left font-mono text-muted-foreground hidden md:table-cell">
              {b.asset.address ? `${b.asset.address.slice(0, 10)}…` : 'not on this network'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SpotOrdersTable({ account, onlyMarket }: { account: AccountResponse | null; onlyMarket?: string }) {
  const w = useWallet()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!account) return <Loading />
  const orders = onlyMarket ? account.spotOrders.filter((o) => o.market === onlyMarket) : account.spotOrders
  if (!orders.length) return <p className="p-6 text-center text-xs text-muted-foreground">No open orders{onlyMarket ? ' on this market' : ''}.</p>
  const cancel = async (o: AccountResponse['spotOrders'][number]) => {
    setBusy(o.orderId)
    setErr(null)
    try {
      await w.sendExchange({
        op: 'CANCEL_ORDER',
        params: { order_id: o.orderId, pair: o.pair },
        label: `Cancel ${o.side} ${o.amount} ${o.base.symbol} @ ${o.price}`,
        market: o.market ?? undefined,
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
            <th className="px-3 py-1 text-left font-normal">Side</th>
            <th className="px-3 py-1 font-normal">Price</th>
            <th className="px-3 py-1 font-normal">Size</th>
            <th className="px-3 py-1 font-normal">Filled</th>
            <th className="px-3 py-1" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.orderId} className="border-t text-right">
              <td className="px-3 py-1.5 text-left">
                {o.path ? <Link href={o.path} className="hover:underline">{o.market}</Link> : o.market}
              </td>
              <td className={cn('px-3 py-1.5 text-left capitalize', o.side === 'buy' ? 'text-bid' : 'text-ask')}>{o.side}</td>
              <td className="px-3 py-1.5">{fmtPrice(o.price)}</td>
              <td className="px-3 py-1.5">{fmtSize(o.amount)}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{fmtSize(o.filled)}</td>
              <td className="px-3 py-1.5">
                <button
                  onClick={() => cancel(o)}
                  disabled={busy === o.orderId}
                  className="rounded border px-2 py-0.5 hover:bg-accent disabled:opacity-50"
                >
                  {busy === o.orderId ? '…' : 'Cancel'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function Transactions({ txs }: { txs: ReturnType<typeof usePendingTxs>['txs'] }) {
  const explorer = useNet().network.explorerUrl
  if (!txs.length) return <p className="p-6 text-center text-xs text-muted-foreground">Nothing submitted from this browser yet.</p>
  return (
    <table className="w-full text-xs">
      <tbody>
        {txs.map((t) => (
          <tr key={t.txHash} className="border-t align-top">
            <td className="px-3 py-1.5 w-6">
              {t.status === 'pending' ? (
                <Clock className="h-3.5 w-3.5 text-amber-500" />
              ) : t.status === 'success' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-bid" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-ask" />
              )}
            </td>
            <td className="px-1 py-1.5">
              <div>{t.label}</div>
              <div className="text-muted-foreground">
                {t.status === 'pending'
                  ? 'Waiting for a block'
                  : t.status === 'success'
                    ? `Executed in block ${t.blockHeight}${describeResult(t.result)}`
                    : `Failed in block ${t.blockHeight}: ${t.error}`}
              </div>
            </td>
            <td className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap">
              {timeAgo(t.submittedAt)}
              <a href={`${explorer}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex" aria-label="Explorer">
                <ExternalLink className="h-3 w-3" />
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function describeResult(r: Record<string, unknown> | undefined): string {
  if (!r) return ''
  if (typeof r.amount_out === 'string') return ` · received ${fixed(r.amount_out, 8)}`
  if (typeof r.filled === 'string') return ` · filled ${fmtSize(r.filled)}${r.order_id ? ` · order ${String(r.order_id).slice(0, 8)}` : ''}`
  if (Array.isArray(r.fills)) return ` · ${r.fills.length} fill${r.fills.length === 1 ? '' : 's'}${r.resting ? ', rest on book' : ''}`
  return ''
}

function Loading() {
  return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
}
