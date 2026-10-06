'use client'

import Link from 'next/link'
import { PieChart } from 'lucide-react'
import { AccountPanel, BalancesTable, SpotOrdersTable } from '@/components/trade/AccountPanel'
import { PerpOrdersTable, PositionsTable } from '@/components/trade/PerpTables'
import { collateralLabel } from '@/components/trade/PerpOrderForm'
import { useAccount } from '@/components/trade/SpotTradeView'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { fixed, size as fmtSize, tone } from '@/lib/format'
import type { AccountResponse } from '@/lib/types'
import { useWallet } from '@/lib/wallet/WalletContext'

export function Portfolio() {
  const w = useWallet()
  const account = useAccount()
  const a = account.data
  const perp = a?.perp
  const unit = collateralLabel(a)
  const upnl = perp ? Object.values(perp.positions).reduce((s, p) => s + Number(p.unrealized_pnl), 0) : null

  if (!w.trader) {
    return (
      <main className="hero-glow">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <PieChart className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Your portfolio</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Connect the QRDX Wallet to see everything your account holds on this network, read straight from the chain.
          </p>
          <div className="mt-6 flex justify-center">
            <ConnectButton className="h-10 px-6" />
          </div>
          <div className="mt-12 grid gap-3 text-left sm:grid-cols-4">
            {[
              ['Balances', 'Every token the account holds, and what is locked in orders.'],
              ['Orders', 'Open limit orders on any spot book, cancellable here.'],
              ['Liquidity', 'Your pool positions and the fees they have earned.'],
              ['Perps', 'Positions, margin and unrealized PnL.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border bg-card p-4">
                <div className="text-sm font-semibold">{t}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{w.trader}</p>
      {account.error && !a && <p className="mt-4 text-sm text-ask">{account.error.message}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Box k="Spot assets" v={a ? String(a.balances.filter((b) => Number(b.balance) > 0).length) : '—'} />
        <Box k="Open spot orders" v={a ? String(a.spotOrders.length) : '—'} />
        <Box k={`Perps equity (${unit})`} v={perp ? fixed(perp.equity, 2) : '—'} />
        <Box k="Unrealized PnL" v={upnl === null ? '—' : fixed(upnl.toFixed(2), 2)} className={tone(upnl === null ? null : String(upnl))} />
      </div>

      <section className="mt-6 h-[460px] overflow-hidden rounded-xl border bg-card">
        <AccountPanel
          tabs={[
            { id: 'balances', label: 'Balances', render: () => <BalancesTable account={a} /> },
            { id: 'orders', label: 'Spot orders', render: () => <SpotOrdersTable account={a} /> },
            { id: 'lp', label: 'Liquidity', render: () => <LpTable account={a} /> },
            { id: 'positions', label: 'Perp positions', render: () => <PositionsTable account={a} /> },
            { id: 'porders', label: 'Perp orders', render: () => <PerpOrdersTable account={a} /> },
          ]}
        />
      </section>
    </main>
  )
}

function LpTable({ account }: { account: AccountResponse | null }) {
  if (!account) return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
  if (!account.lpPositions.length) return <p className="p-6 text-center text-xs text-muted-foreground">No liquidity positions.</p>
  return (
    <table className="w-full text-xs tabular">
      <thead className="text-muted-foreground">
        <tr className="text-right">
          <th className="px-3 py-1 text-left font-normal">Pool</th>
          <th className="px-3 py-1 font-normal">Amounts</th>
          <th className="px-3 py-1 font-normal">Uncollected fees</th>
          <th className="px-3 py-1 font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {account.lpPositions.map((p) => (
          <tr key={p.position_id} className="border-t text-right">
            <td className="px-3 py-1.5 text-left">
              <Link href={`/pools/${p.pool_id}`} className="font-mono hover:underline">
                {p.pool_id}
              </Link>
            </td>
            <td className="px-3 py-1.5">
              {fmtSize(p.amount0)} / {fmtSize(p.amount1)}
            </td>
            <td className="px-3 py-1.5 text-bid">
              {fmtSize(p.fees0)} / {fmtSize(p.fees1)}
            </td>
            <td className={p.in_range ? 'px-3 py-1.5 text-bid' : 'px-3 py-1.5 text-warn'}>{p.in_range ? 'In range' : 'Out of range'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Box({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className={`num mt-1 text-xl font-semibold tracking-tight ${className ?? ''}`}>{v}</div>
    </div>
  )
}
