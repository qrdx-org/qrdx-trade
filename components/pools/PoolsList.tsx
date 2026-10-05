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
    <main className="mx-auto max-w-5xl px-3 py-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Pools</h1>
        <Link href="/pools/new" className="ml-auto rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          New pool
        </Link>
        <Link href="/launch" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90">
          Launch a coin
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Concentrated-liquidity pools on the QRDX chain. Liquidity earns 70 % of a pool&apos;s fee while the price is inside its range.
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm tabular">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-right">
              <th className="px-4 py-2 text-left font-normal">Pool</th>
              <th className="px-4 py-2 font-normal">Fee</th>
              <th className="px-4 py-2 font-normal">Price</th>
              <th className="px-4 py-2 font-normal hidden sm:table-cell">Active liquidity</th>
              <th className="px-4 py-2 font-normal hidden md:table-cell">Volume (all time)</th>
              <th className="px-4 py-2 font-normal hidden md:table-cell">Positions</th>
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
                <tr key={p.poolId} className="border-t text-right hover:bg-accent/50">
                  <td className="px-4 py-2 text-left">
                    <Link href={`/pools/${p.poolId}`} className="flex items-center gap-2">
                      <PairBadge base={p.market.base} quote={p.market.quote} size="sm" />
                      <span className="font-medium">
                        {p.market.base.symbol}/{p.market.quote.symbol}
                      </span>
                      {p.paused && <span className="text-[10px] text-amber-500">paused</span>}
                      {(!p.token0.verified || !p.token1.verified) && <span className="text-[10px] text-amber-500">unverified</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{fixed(String(Number(p.feeRate) * 100), 2)}%</td>
                  <td className="px-4 py-2">
                    {fmtPrice(p.marketPrice)} <span className="text-xs text-muted-foreground">{p.market.quote.symbol}</span>
                  </td>
                  <td className="px-4 py-2 hidden sm:table-cell">{compact(p.liquidity)}</td>
                  <td className={cn('px-4 py-2 hidden md:table-cell')}>
                    {compact(baseIs0 ? p.volume[0] : p.volume[1])} {p.market.base.symbol}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell">{p.positions}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
