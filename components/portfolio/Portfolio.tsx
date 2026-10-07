'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Activity, Check, Copy, Eye, LineChart, PieChart, Target, Wallet } from 'lucide-react'
import { AccountPanel, BalancesTable, SpotOrdersTable } from '@/components/trade/AccountPanel'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { PerpOrdersTable, PositionsTable } from '@/components/trade/PerpTables'
import { collateralLabel } from '@/components/trade/PerpOrderForm'
import { useAccount } from '@/components/trade/SpotTradeView'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { PnlChart, RANGES, RangeId, rangePoints } from '@/components/portfolio/PnlChart'
import { compact, fixed, size as fmtSize, timeAgo, tone } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { AccountResponse, ApiAsset, IndexPrice, PnlMarket, PnlResponse } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

type Prices = { prices: Record<string, IndexPrice | null> }

const signedUsd = (v: number | string | null | undefined) => {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${compact(n, '$')}`
}

/** The segment the prices endpoint keys an asset by (native QRDX: its slug). */
const priceKey = (a: Pick<ApiAsset, 'segment'>) => a.segment.toLowerCase()

export function Portfolio() {
  const w = useWallet()
  const { apiBase } = useNet()
  // ?address= shows any account, read only; otherwise the connected wallet's.
  const param = useSearchParams().get('address')
  const watched = param && /^0xPQ[0-9a-fA-F]{64}$/.test(param) && param !== w.trader ? param : null
  const address = watched ?? w.trader
  const own = useAccount()
  const other = useApi<AccountResponse>(watched ? `${apiBase}/accounts/${watched}` : null, 15_000)
  const account = watched ? other : own
  const a = account.data
  const pnl = useApi<PnlResponse>(address ? `${apiBase}/accounts/${address}/pnl` : null, 30_000)
  const [range, setRange] = useState<RangeId>('all')

  const held = useMemo(() => (a?.balances ?? []).filter((b) => Number(b.balance) > 0 || Number(b.inOrders) > 0), [a])
  const collateral = a?.perp?.collateral_token || null
  const priceAssets = useMemo(() => {
    const keys = new Set(held.map((b) => priceKey(b.asset)))
    if (collateral) keys.add(collateral.toUpperCase() === 'QRDX' ? 'qrdx' : collateral.toLowerCase())
    return [...keys].sort()
  }, [held, collateral])
  const prices = useApi<Prices>(priceAssets.length ? `${apiBase}/prices?assets=${priceAssets.join(',')}` : null, 30_000)

  const holdings = useMemo(() => {
    const p = prices.data?.prices ?? {}
    const rows = held.map((b) => {
      const amount = Number(b.balance) + Number(b.inOrders)
      const price = p[priceKey(b.asset)]
      return { b, amount, usd: price ? amount * Number(price.price) : null, change: price?.change24h ?? null }
    })
    const perp = a?.perp
    const collateralPrice = collateral ? p[collateral.toUpperCase() === 'QRDX' ? 'qrdx' : collateral.toLowerCase()] : null
    const perpUsd = perp && collateralPrice ? Number(perp.equity) * Number(collateralPrice.price) : null
    const spotUsd = rows.reduce((s, r) => s + (r.usd ?? 0), 0)
    const total = spotUsd + (perpUsd ?? 0)
    rows.sort((x, y) => (y.usd ?? -1) - (x.usd ?? -1))
    return { rows, perpUsd, spotUsd, total, priced: rows.some((r) => r.usd !== null) }
  }, [held, prices.data, a?.perp, collateral])

  if (!address) return <Disconnected />

  const t = pnl.data?.totals
  const decided = t ? t.wins + t.losses : 0
  const pts = pnl.data ? rangePoints(pnl.data, range) : null

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            Portfolio
            {watched && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Eye className="h-3 w-3" /> Watching, read only
              </span>
            )}
          </h1>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs text-muted-foreground">{address}</span>
            <CopyIcon value={address} />
            <ExplorerLink id={address} label="View in explorer" className="whitespace-nowrap rounded-md border px-2 py-0.5 text-xs" />
          </div>
        </div>
        {account.error && !a && <p className="text-sm text-ask">{account.error.message}</p>}
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={Wallet}
          k="Account value"
          v={a && prices.data ? compact(holdings.total, '$') : '—'}
          sub={a ? `${held.length} asset${held.length === 1 ? '' : 's'}${a.perp && Number(a.perp.equity) > 0 ? ` · perps ${fixed(a.perp.equity, 2)} ${collateralLabel(a)}` : ''}` : 'Loading…'}
        />
        <Tile
          icon={LineChart}
          k="Total PnL"
          v={t ? signedUsd(t.pnlUsd) : '—'}
          tone={t ? tone(t.pnlUsd) : undefined}
          sub={t ? `${signedUsd(t.realizedUsd)} realized · ${signedUsd(t.unrealizedUsd)} open` : pnl.error ? 'unavailable' : 'Loading…'}
        />
        <Tile
          icon={Target}
          k="Win rate"
          v={t && decided ? `${((t.wins / decided) * 100).toFixed(0)}%` : '—'}
          sub={t ? `${t.wins} winning · ${t.losses} losing closes` : 'Loading…'}
        />
        <Tile icon={Activity} k="Volume traded" v={t ? compact(t.volumeUsd, '$') : '—'} sub={t ? `${t.trades} fill${t.trades === 1 ? '' : 's'} on ${pnl.data!.markets.length} market${pnl.data!.markets.length === 1 ? '' : 's'}` : 'Loading…'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="flex flex-col rounded-xl border bg-card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Profit and loss</h2>
              <p className="text-xs text-muted-foreground">
                {pts ? (
                  <>
                    <span className={cn('num font-medium', tone(String(pts.change)))}>{signedUsd(pts.change)}</span> over{' '}
                    {range === 'all' ? 'all recorded trades' : `the last ${RANGES.find((r) => r.id === range)!.label}`}
                  </>
                ) : (
                  'Realized from your fills, plus open positions at the current price'
                )}
              </p>
            </div>
            <div className="flex rounded-lg border p-0.5 text-xs">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={cn('rounded-md px-2.5 py-1 font-medium transition-colors', range === r.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative h-[300px]">
            {pnl.data && (pnl.data.series.length || pnl.data.markets.length) ? (
              <PnlChart pnl={pnl.data} range={range} className="h-full" />
            ) : (
              <Placeholder>
                {pnl.error ? `PnL unavailable: ${pnl.error.message}` : !pnl.data ? 'Loading your trades…' : (
                  <>
                    No trades yet in the node&apos;s recent history.{' '}
                    <Link href="/trade" className="text-primary hover:underline">
                      Find a market
                    </Link>
                  </>
                )}
              </Placeholder>
            )}
          </div>
          <p className="border-t px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Solid: realized PnL, cumulative. Dashed: now, with open positions marked to the last price. Spot on an average-cost basis per market;
            perps as the clearinghouse realized them. USD at today&apos;s prices (public index or pool route).
            {pnl.data?.window.truncated ? ' Older trades are beyond the node’s per-market window.' : ''}
            {pnl.data?.window.from ? ` First realization ${timeAgo(pnl.data.window.from)}.` : ''}
          </p>
        </section>

        <section className="flex flex-col rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Allocation</h2>
            <span className="text-xs text-muted-foreground">USD, reference</span>
          </div>
          {!a ? (
            <Placeholder>Loading balances…</Placeholder>
          ) : !held.length && !holdings.perpUsd ? (
            <Placeholder>This account holds nothing on this network yet.</Placeholder>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {holdings.total > 0 &&
                  [...holdings.rows.filter((r) => r.usd), ...(holdings.perpUsd ? [{ b: null, usd: holdings.perpUsd }] : [])].map((r, i) => (
                    <div
                      key={r.b?.asset.segment ?? 'perps'}
                      title={r.b?.asset.symbol ?? 'Perps equity'}
                      style={{ width: `${(100 * r.usd!) / holdings.total}%`, background: r.b?.asset.color ?? 'hsl(var(--primary))' }}
                      className={cn('h-full', i > 0 && 'border-l border-card')}
                    />
                  ))}
              </div>
              <ul className="mt-3 max-h-[236px] space-y-0.5 overflow-y-auto pr-1">
                {holdings.rows.map((r) => (
                  <li key={r.b.asset.segment} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent/50">
                    <TokenBadge asset={r.b.asset} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {r.b.asset.symbol}
                        {r.b.asset.address && r.b.asset.address !== 'QRDX' && <ExplorerLink id={r.b.asset.address} />}
                      </div>
                      <div className="num truncate text-xs text-muted-foreground">{fmtSize(String(r.amount))}</div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm">{r.usd === null ? '—' : compact(r.usd, '$')}</div>
                      <div className="num text-[11px] text-muted-foreground">
                        {r.usd !== null && holdings.total > 0 ? `${((100 * r.usd) / holdings.total).toFixed(1)}%` : 'no USD price'}
                      </div>
                    </div>
                  </li>
                ))}
                {holdings.perpUsd !== null && a.perp && Number(a.perp.equity) > 0 && (
                  <li className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">P</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Perps equity</div>
                      <div className="num text-xs text-muted-foreground">
                        {fixed(a.perp.equity, 2)} {collateralLabel(a)}
                      </div>
                    </div>
                    <div className="num text-sm">{compact(holdings.perpUsd, '$')}</div>
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>
      </div>

      {pnl.data && pnl.data.markets.length > 0 && <MarketsPnl markets={pnl.data.markets} />}

      <section className="mt-4 h-[460px] overflow-hidden rounded-xl border bg-card">
        <AccountPanel
          tabs={
            watched
              ? [
                  { id: 'balances', label: 'Balances', render: () => <BalancesTable account={a} />, public: true },
                  { id: 'lp', label: 'Liquidity', render: () => <LpTable account={a} />, public: true },
                ]
              : [
                  { id: 'balances', label: 'Balances', render: () => <BalancesTable account={a} /> },
                  { id: 'orders', label: `Spot orders${a?.spotOrders.length ? ` (${a.spotOrders.length})` : ''}`, render: () => <SpotOrdersTable account={a} /> },
                  { id: 'lp', label: 'Liquidity', render: () => <LpTable account={a} /> },
                  { id: 'positions', label: 'Perp positions', render: () => <PositionsTable account={a} /> },
                  { id: 'porders', label: 'Perp orders', render: () => <PerpOrdersTable account={a} /> },
                ]
          }
        />
      </section>
    </main>
  )
}

function MarketsPnl({ markets }: { markets: PnlMarket[] }) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">PnL by market</h2>
        <span className="text-xs text-muted-foreground">realized + open, in each market&apos;s quote</span>
      </div>
      <div className="overflow-x-auto">
        <table className="num w-full text-xs">
          <thead className="text-[11px] text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-2 text-left font-medium">Market</th>
              <th className="px-3 py-2 font-medium">Fills</th>
              <th className="px-3 py-2 font-medium">Volume</th>
              <th className="px-3 py-2 font-medium">Realized</th>
              <th className="px-3 py-2 font-medium">Open PnL</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Position</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Avg cost / entry</th>
              <th className="px-4 py-2 font-medium">Total (USD)</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => {
              const total = m.realizedUsd === null ? null : Number(m.realizedUsd) + Number(m.unrealizedUsd ?? 0)
              return (
                <tr key={`${m.kind}:${m.market}`} className="border-t text-right hover:bg-accent/40">
                  <td className="px-4 py-2 text-left">
                    <Link href={m.path} className="font-medium hover:text-primary">
                      {m.market}
                    </Link>
                    <span className="ml-2 rounded border px-1 py-px text-[10px] uppercase text-muted-foreground">{m.kind}</span>
                  </td>
                  <td className="px-3 py-2">
                    {m.trades}
                    {m.wins + m.losses > 0 && <span className="ml-1 text-muted-foreground">({m.wins}W/{m.losses}L)</span>}
                  </td>
                  <td className="px-3 py-2">
                    {compact(m.volume)} <span className="text-muted-foreground">{m.unit}</span>
                  </td>
                  <td className={cn('px-3 py-2', tone(m.realized))}>{signed(m.realized)}</td>
                  <td className={cn('px-3 py-2', tone(m.unrealized))}>{signed(m.unrealized)}</td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    {Number(m.position) === 0 ? <span className="text-muted-foreground">—</span> : <>{fmtSize(m.position)} <span className="text-muted-foreground">{m.positionSymbol}</span></>}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{m.avgCost ? `${fmtSize(m.avgCost, 6)} ${m.unit}` : '—'}</td>
                  <td className={cn('px-4 py-2 font-medium', tone(total === null ? null : String(total)))}>{total === null ? 'no USD price' : signedUsd(total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const signed = (v: string) => (Number(v) > 0 ? '+' : '') + compact(v)

function Tile({ icon: Icon, k, v, sub, tone: t }: { icon: React.ComponentType<{ className?: string }>; k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {k}
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className={cn('num mt-1 truncate text-2xl font-semibold tracking-tight', t)}>{v}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-xs text-muted-foreground">{children}</div>
}

function CopyIcon({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      aria-label="Copy address"
      className="text-muted-foreground hover:text-foreground"
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function Disconnected() {
  return (
    <main className="hero-glow">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
          <PieChart className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Your portfolio</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Connect the QRDX Wallet to see everything your account holds on this network, and how your trades have done, read straight from the chain.
        </p>
        <div className="mt-6 flex justify-center">
          <ConnectButton className="h-10 px-6" />
        </div>
        <div className="mt-12 grid gap-3 text-left sm:grid-cols-4">
          {[
            ['PnL', 'Realized and open profit over time, per market.'],
            ['Allocation', 'Every token the account holds, valued in USD.'],
            ['Orders', 'Open limit orders on any spot book, cancellable here.'],
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
