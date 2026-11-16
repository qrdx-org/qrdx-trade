'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, Gauge, Layers, ListOrdered, Plus, Wallet } from 'lucide-react'
import { AccountLabel, usdText } from '@/components/accounts/AccountBits'
import { useAccounts } from '@/components/accounts/AccountsContext'
import { DeadMansSwitch, FeesAndReferrals, TradingKeys } from '@/components/portfolio/AccountTools'
import { CopyIcon, Tile } from '@/components/portfolio/Portfolio'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { Button } from '@/components/ui/button'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { S } from '@/lib/decimal'
import { fixed, size as fmtSize, tone } from '@/lib/format'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { accountName } from '@/lib/subaccounts'
import type { AccountSummary } from '@/lib/types'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

const collateral = (t: string) => (t.toUpperCase() === 'QRDX' ? 'QRDX' : 'USDC')
const orders = (a: AccountSummary) => a.spotOrders + (a.perp?.orders ?? 0) + a.triggers

/**
 * The wallet account and every account it signs for, side by side: what each holds, its perps
 * account and orders, with moving funds between them, creating one, and switching which one the
 * trading screens use. The account-wide settings (fees, trading keys, dead man's switch) under it.
 */
export function AccountsView() {
  const w = useWallet()
  const features = useFeatures()
  const { accounts, loaded, available, usd, totalUsd, maxSubaccounts, openTransfer, openCreate } = useAccounts()
  const [open, setOpen] = useState<string | null>(null)

  if (w.status !== 'connected' || !w.trader) return <Disconnected />
  if (features.known && !features.trading) {
    return <Notice title="Not on this network yet" text="This network's node has no sub-accounts. They arrive with qrdx-node's 2026-10 release." />
  }

  const subs = accounts.filter((a) => a.kind === 'sub')
  // Perps equity alone: the account's value without its spot balances.
  const perpsUsd = accounts.reduce((s, a) => s + ((a.perp && usd({ ...a, balances: [] })) || 0), 0)
  const openOrders = accounts.reduce((s, a) => s + orders(a), 0)
  const unfunded = subs.filter((a) => S.isZero(a.qrdx) && (a.balances.length > 0 || a.spotOrders > 0))

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Your wallet account and the sub-accounts and vaults it signs for. Each keeps its own balances, margin, orders and positions, so a strategy&apos;s risk stays in its own account.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openTransfer()} disabled={!available || subs.length === 0}>
            <ArrowLeftRight className="mr-1.5 h-4 w-4" /> Transfer
          </Button>
          <Button onClick={openCreate} disabled={!available || subs.length >= maxSubaccounts}>
            <Plus className="mr-1.5 h-4 w-4" /> New sub-account
          </Button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Wallet} k="Total value" v={loaded ? usdText(totalUsd) : '—'} sub="All accounts, USD reference prices" />
        <Tile icon={Layers} k="Sub-accounts" v={loaded ? `${subs.length} / ${maxSubaccounts}` : '—'} sub={subs.length ? `${subs.filter((a) => a.balances.length).length} funded` : 'None yet'} />
        <Tile icon={Gauge} k="Perps equity" v={loaded ? usdText(perpsUsd) : '—'} sub={`${accounts.reduce((s, a) => s + (a.perp?.positions ?? 0), 0)} open positions`} />
        <Tile icon={ListOrdered} k="Open orders" v={loaded ? String(openOrders) : '—'} sub="Spot, perps and triggers" />
      </div>

      {unfunded.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
          <span className="flex-1">
            {unfunded.length === 1 ? `${accountName(unfunded[0])} holds funds but no QRDX` : `${unfunded.length} sub-accounts hold funds but no QRDX`}. A sub-account pays its own gas, so it cannot trade until it has some.
          </span>
          <Button size="sm" variant="outline" onClick={() => openTransfer({ to: unfunded[0].address, asset: 'QRDX' })}>
            Send QRDX
          </Button>
        </div>
      )}

      <section className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="hidden grid-cols-[minmax(0,2fr)_100px_minmax(0,1.5fr)_120px_64px_320px] gap-4 border-b px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <span>Account</span>
          <span className="text-right">Value</span>
          <span>Holdings</span>
          <span className="text-right">Perps equity</span>
          <span className="text-right">Orders</span>
          <span className="text-right">Actions</span>
        </div>
        {!loaded ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        ) : (
          accounts.map((a) => (
            <Fragment key={a.address}>
              <AccountRow account={a} usd={usd(a)} open={open === a.address} onToggle={() => setOpen(open === a.address ? null : a.address)} />
              {open === a.address && <AccountDetail account={a} />}
            </Fragment>
          ))
        )}
        {loaded && subs.length === 0 && (
          <div className="flex flex-col items-center gap-2 border-t px-4 py-8 text-center">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">No sub-accounts yet</p>
            <p className="max-w-md text-xs text-muted-foreground">Create one to trade a strategy with its own margin: a loss there cannot touch the rest of your funds. You can create up to {maxSubaccounts}.</p>
            <Button size="sm" className="mt-1" onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New sub-account
            </Button>
          </div>
        )}
      </section>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Settings</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">For the wallet account and everything it signs for.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <FeesAndReferrals />
        <TradingKeys />
        <DeadMansSwitch />
      </div>
    </main>
  )
}

function AccountRow({ account: a, usd, open, onToggle }: { account: AccountSummary; usd: number | null; open: boolean; onToggle: () => void }) {
  const w = useWallet()
  const router = useRouter()
  const { openTransfer } = useAccounts()
  const active = (w.tradingAccount ?? '').toLowerCase() === a.address.toLowerCase()
  const trade = () => w.setActingAs(a.kind === 'main' ? null : a.address)
  const top = a.balances.slice(0, 3)
  return (
    <div
      className={cn(
        'grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40 lg:grid-cols-[minmax(0,2fr)_100px_minmax(0,1.5fr)_120px_64px_320px]',
        open && 'bg-muted/40'
      )}
      onClick={onToggle}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <AccountLabel account={a} address />
        {active && <span className="hidden shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background sm:inline">Trading</span>}
      </div>
      <div className="num text-right text-sm font-medium">{usdText(usd)}</div>
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs lg:col-span-1">
        {top.length === 0 ? (
          <span className="text-muted-foreground">Empty</span>
        ) : (
          top.map((b) => (
            <span key={b.asset.segment} className="num flex items-center gap-1">
              <TokenBadge asset={b.asset} size="xs" />
              {fmtSize(S.add(b.balance, b.inOrders), 2)} <span className="text-muted-foreground">{b.asset.symbol}</span>
            </span>
          ))
        )}
        {a.balances.length > 3 && <span className="text-muted-foreground">+{a.balances.length - 3}</span>}
        {a.kind === 'sub' && S.isZero(a.qrdx) && a.balances.length > 0 && (
          <span className="flex items-center gap-1 text-warn" title="A sub-account pays its own gas">
            <AlertTriangle className="h-3 w-3" /> no QRDX for gas
          </span>
        )}
      </div>
      <div className="hidden text-right text-xs lg:block">
        {a.perp && !S.isZero(a.perp.equity) ? (
          <>
            <div className="num font-medium">
              {fixed(a.perp.equity, 2)} {collateral(a.perp.collateralToken)}
            </div>
            {a.perp.positions > 0 && <div className={cn('num', tone(a.perp.unrealizedPnl))}>{fixed(a.perp.unrealizedPnl, 2)} uPnL</div>}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="num hidden text-right text-xs lg:block">{orders(a) || <span className="text-muted-foreground">—</span>}</div>
      <div className="col-span-2 flex flex-wrap justify-end gap-1.5 lg:col-span-1" onClick={(e) => e.stopPropagation()}>
        {a.kind === 'sub' && (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openTransfer({ to: a.address })} title="Move funds into it">
              <ArrowDownLeft className="mr-1 h-3 w-3" /> Deposit
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openTransfer({ from: a.address })} disabled={!a.balances.some((b) => !S.isZero(b.balance))} title="Move funds out of it">
              <ArrowUpRight className="mr-1 h-3 w-3" /> Withdraw
            </Button>
          </>
        )}
        {a.kind === 'vault' && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => router.push(`/vaults/${a.address}`)}>
            Vault page
          </Button>
        )}
        <Button size="sm" variant={active ? 'secondary' : 'default'} className="h-7 px-2.5 text-xs" disabled={active} onClick={() => (trade(), router.push('/trade'))}>
          {active ? 'Trading as' : 'Trade as'}
        </Button>
      </div>
    </div>
  )
}

function AccountDetail({ account: a }: { account: AccountSummary }) {
  const w = useWallet()
  const router = useRouter()
  return (
    <div className="grid gap-4 border-b bg-muted/20 px-4 py-4 text-xs lg:grid-cols-[2fr_1fr]">
      <div className="min-w-0">
        <div className="mb-2 font-medium text-muted-foreground">Balances</div>
        {a.balances.length === 0 ? (
          <p className="text-muted-foreground">Nothing here yet.</p>
        ) : (
          <table className="num w-full">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="pb-1 font-normal">Asset</th>
                <th className="pb-1 text-right font-normal">Available</th>
                <th className="pb-1 text-right font-normal">In orders</th>
              </tr>
            </thead>
            <tbody>
              {a.balances.map((b) => (
                <tr key={b.asset.segment} className="border-t border-border/60">
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5">
                      <TokenBadge asset={b.asset} size="xs" /> {b.asset.symbol}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">{fmtSize(b.balance)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{S.isZero(b.inOrders) ? '—' : fmtSize(b.inOrders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 font-medium text-muted-foreground">Address</div>
          <div className="flex items-center gap-2">
            <span className="min-w-0 break-all font-mono text-[11px]">{a.address}</span>
            <CopyIcon value={a.address} />
            <ExplorerLink id={a.address} />
          </div>
        </div>
        {a.perp && (
          <div>
            <div className="mb-1 font-medium text-muted-foreground">Perps</div>
            <dl className="num grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Collateral</dt>
              <dd className="text-right">{fixed(a.perp.collateral, 2)}</dd>
              <dt className="text-muted-foreground">Withdrawable</dt>
              <dd className="text-right">{fixed(a.perp.withdrawable, 2)}</dd>
              <dt className="text-muted-foreground">Positions</dt>
              <dd className="text-right">{a.perp.positions}</dd>
              <dt className="text-muted-foreground">Unrealized</dt>
              <dd className={cn('text-right', tone(a.perp.unrealizedPnl))}>{fixed(a.perp.unrealizedPnl, 2)}</dd>
            </dl>
          </div>
        )}
        <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={() => (w.setActingAs(a.kind === 'main' ? null : a.address), router.push('/portfolio'))}>
          Open its portfolio
        </Button>
      </div>
    </div>
  )
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </main>
  )
}

function Disconnected() {
  return (
    <main className="hero-glow">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Accounts</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Connect the QRDX Wallet to manage its sub-accounts: separate balances and margin for each strategy, all signed for by the one wallet.
        </p>
        <div className="mt-6 flex justify-center">
          <ConnectButton className="h-10 px-6" />
        </div>
        <div className="mt-12 grid gap-3 text-left sm:grid-cols-3">
          {[
            ['Isolated risk', 'A liquidation in one sub-account cannot touch the funds in another.'],
            ['One wallet', 'Up to 20 sub-accounts, all signed for by the same key. No new seed phrase.'],
            ['Instant transfers', 'Move any asset between them on chain, from one dialog.'],
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
