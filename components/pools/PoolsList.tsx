'use client'

import Link from 'next/link'
import { PairBadge } from '@/components/trade/TokenBadge'
import { compact, fixed, price as fmtPrice } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { ApiAsset } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet } from '@/lib/wallet/WalletContext'

export interface PoolRow {
  poolId: string
  token0: ApiAsset
  token1: ApiAsset
  market: { base: ApiAsset; quote: ApiAsset; path: string }
  feeTier: number
  feeRate: string
  tickSpacing: number
  price: string
  marketPrice: string | null
  tick: number
  liquidity: string
  positions: number
  volume: [string, string]
  paused: boolean
}

export function PoolsList() {
  const { apiBase } = useNet()
  const { data, error } = useApi<{ pools: PoolRow[] }>(`${apiBase}/pools`, 10_000)
  return (
    <main>
      <section className="hero-glow border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-4 px-4 pb-8 pt-10">
          <div className="mr-auto">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Liquidity</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Pools</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Concentrated-liquidity pools on the QRDX chain. Liquidity earns 70 % of a pool&apos;s fee while the price is inside its range.
            </p>
          </div>
          <Link href="/pools/new" className="rounded-lg border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/30">
            New pool
          </Link>
          <Link href="/launch" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Launch a coin
          </Link>
        </div>
      </section>
      <div className="mx-auto mt-8 max-w-6xl overflow-x-auto rounded-xl border bg-card px-0 sm:mx-4 xl:mx-auto">
        <table className="num w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-3 text-left font-medium">Pool</th>
              <th className="px-4 py-3 font-medium">Fee</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Active liquidity</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell" title="Cumulative amounts swapped into the pool, per token">Swapped in (all time)</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Positions</th>
            </tr>
          </thead>
          <tbody>
            {error && !data && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">Pools unavailable: the QRDX node did not answer.</td>
              </tr>
            )}
            {data?.pools.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">No pools yet.</td>
              </tr>
            )}
            {data?.pools.map((p) => {
              const baseIs0 = p.market.base.segment === p.token0.segment
              return (
                <tr key={p.poolId} className="border-t text-right transition-colors hover:bg-accent/50">
                  <td className="px-4 py-3 text-left">
                    <Link href={`/pools/${p.poolId}`} className="flex items-center gap-2">
                      <PairBadge base={p.market.base} quote={p.market.quote} size="sm" />
                      <span className="font-medium">
                        {p.market.base.symbol}/{p.market.quote.symbol}
                      </span>
                      {p.paused && <span className="text-[10px] text-warn">paused</span>}
                      {(!p.token0.verified || !p.token1.verified) && <span className="text-[10px] text-warn">unverified</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{fixed(String(Number(p.feeRate) * 100), 2)}%</td>
                  <td className="px-4 py-3">
                    {fmtPrice(p.marketPrice)} <span className="text-xs text-muted-foreground">{p.market.quote.symbol}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">{compact(p.liquidity)}</td>
                  <td className={cn('px-4 py-3 hidden md:table-cell')}>
                    {compact(baseIs0 ? p.volume[0] : p.volume[1])} {p.market.base.symbol}
                    <span className="text-muted-foreground"> · {compact(baseIs0 ? p.volume[1] : p.volume[0])} {p.market.quote.symbol}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">{p.positions}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
