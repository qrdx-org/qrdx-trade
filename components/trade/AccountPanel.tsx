'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, Wallet, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PanelTabs } from '@/components/trade/Panel'
import { ConnectDialog } from '@/components/wallet/ConnectButton'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { fixed, price as fmtPrice, size as fmtSize, timeAgo } from '@/lib/format'
import type { AccountResponse } from '@/lib/types'
import { usePendingTxs } from '@/lib/wallet/pending'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'
import { orderMarket, spotLimitParams } from '@/lib/orders'
import { AmendOrder, CancelAll, useSequence } from '@/components/trade/OrderManage'

export type AccountTab = {
  id: string
  label: string
  render: () => React.ReactNode
  /** Shown without a wallet (market info). */
  public?: boolean
}

/** Tabbed panel under the chart. Spot and perps pass their own tabs; Transactions is shared. */
export function AccountPanel({ tabs, extra }: { tabs: AccountTab[]; extra?: AccountTab[] }) {
  const w = useWallet()
  const { slot } = useNet()
  const { txs, pending } = usePendingTxs(w.trader, slot)
  const [dialog, setDialog] = useState(false)
  const all: AccountTab[] = [
    ...tabs,
    {
      id: 'txs',
      label: `Transactions${pending ? ` (${pending})` : ''}`,
      render: () => <Transactions txs={txs} />,
    },
    ...(extra ?? []),
  ]
  const [tab, setTab] = useState(all[0].id)
  const current = all.find((t) => t.id === tab) ?? all[0]
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelTabs tabs={all.map((t) => ({ id: t.id, label: t.label }))} value={current.id} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-auto">
        {!w.trader && !current.public ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
            <Wallet className="h-6 w-6 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">Connect the QRDX Wallet to see your balances, orders and transactions.</p>
            <Button size="sm" variant="outline" onClick={() => setDialog(true)}>
              Connect wallet
            </Button>
            <ConnectDialog open={dialog} onOpenChange={setDialog} />
          </div>
        ) : (
          current.render()
        )}
      </div>
    </div>
  )
}

export function BalancesTable({ account }: { account: AccountResponse | null }) {
  if (!account) return <Loading />
  return (
    <table className="num w-full text-xs">
      <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
        <tr className="text-right">
          <th className="px-3 py-2 text-left font-medium">Asset</th>
          <th className="px-3 py-2 font-medium">Available</th>
          <th className="px-3 py-2 font-medium">In orders</th>
          <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Token</th>
        </tr>
      </thead>
      <tbody>
        {account.balances.map((b) => (
          <tr key={b.asset.segment} className="border-t text-right">
            <td className="px-3 py-1.5 text-left">
              <span className="flex items-center gap-2">
                <TokenBadge asset={b.asset} size="xs" />
                {b.asset.symbol}
                {!b.asset.verified && <span className="text-[10px] text-warn">unverified</span>}
              </span>
            </td>
            <td className="px-3 py-1.5">{fmtSize(b.balance)}</td>
            <td className="px-3 py-1.5 text-muted-foreground">{fmtSize(b.inOrders)}</td>
            <td className="px-3 py-1.5 text-left font-mono text-muted-foreground hidden md:table-cell">
              {b.asset.address ? (
                b.asset.address === 'QRDX' ? (
                  'native'
                ) : (
                  <ExplorerLink id={b.asset.address} label={`${b.asset.address.slice(0, 10)}…`} className="font-mono" />
                )
              ) : (
                'not on this network'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SpotOrdersTable({ account, onlyMarket }: { account: AccountResponse | null; onlyMarket?: string }) {
  const seq = useSequence()
  const [busy, setBusy] = useState<string | null>(null)
  if (!account) return <Loading />
  const orders = onlyMarket ? account.spotOrders.filter((o) => o.market === onlyMarket) : account.spotOrders
  if (!orders.length) return <p className="p-6 text-center text-xs text-muted-foreground">No open orders{onlyMarket ? ' on this market' : ''}.</p>
  type Order = AccountResponse['spotOrders'][number]
  const cancelReq = (o: Order) => ({
    op: 'CANCEL_ORDER',
    params: { order_id: o.orderId, pair: o.pair },
    label: `Cancel ${o.side} ${o.amount} ${o.base.symbol} @ ${o.price}`,
    market: o.market ?? undefined,
  })
  const cancel = async (o: Order) => {
    setBusy(o.orderId)
    await seq.run([cancelReq(o)])
    setBusy(null)
  }
  const amend = async (o: Order, price: string, size: string) => {
    setBusy(o.orderId)
    await seq.run([
      cancelReq(o),
      {
        op: 'PLACE_ORDER',
        params: spotLimitParams(orderMarket(o), o.side, price, size),
        label: `${o.side === 'buy' ? 'Buy' : 'Sell'} ${size} ${o.base.symbol} @ ${price} ${o.quote.symbol} (replaces ${o.orderId.slice(0, 8)})`,
        market: o.market ?? undefined,
      },
    ])
    setBusy(null)
  }
  return (
    <>
      {(seq.error || orders.length > 1) && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5">
          <span className="text-xs text-ask">{seq.error}</span>
          <CancelAll count={orders.length} busy={busy === '*' ? seq.progress : null} onConfirm={async () => {
            setBusy('*')
            await seq.run(orders.map(cancelReq))
            setBusy(null)
          }} />
        </div>
      )}
      <table className="num w-full text-xs">
        <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
          <tr className="text-right">
            <th className="px-3 py-2 text-left font-medium">Market</th>
            <th className="px-3 py-2 text-left font-medium">Side</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-3 py-2 font-medium">Filled</th>
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
              <td className="relative px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  {o.base.address && o.quote.address && (
                    <AmendOrder price={o.price} size={o.remaining} sizeLabel={`Size (${o.base.symbol})`} busy={!!busy} onSubmit={(p, sz) => void amend(o, p, sz)} />
                  )}
                  <button
                    onClick={() => cancel(o)}
                    disabled={!!busy}
                    className="rounded-md border px-2.5 py-0.5 text-[11px] font-medium transition-colors hover:border-ask/50 hover:text-ask disabled:opacity-50"
                  >
                    {busy === o.orderId ? '…' : 'Cancel'}
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

function Transactions({ txs }: { txs: ReturnType<typeof usePendingTxs>['txs'] }) {
  if (!txs.length) return <p className="p-6 text-center text-xs text-muted-foreground">Nothing submitted from this browser yet.</p>
  return (
    <table className="w-full text-xs">
      <tbody>
        {txs.map((t) => (
          <tr key={t.txHash} className="border-t align-top">
            <td className="px-3 py-1.5 w-6">
              {t.status === 'pending' ? (
                <Clock className="h-3.5 w-3.5 text-warn" />
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
              <ExplorerLink kind="tx" id={t.txHash} className="ml-2" />
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
