'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Lock, ShieldCheck, Snowflake } from 'lucide-react'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { shortAddress } from '@/lib/assets'
import { compact, percent, price as fmtPrice, tone } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { Launch } from '@/lib/types'
import { useNet } from '@/lib/wallet/WalletContext'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { cn } from '@/lib/utils'

type Sort = 'new' | 'cap' | 'volume'

export function LaunchFeed({ refreshKey }: { refreshKey?: number }) {
  const { apiBase, network } = useNet()
  const { data, error } = useApi<{ launches: Launch[]; height: number | null }>(
    `${apiBase}/launches?limit=60${refreshKey ? `&r=${refreshKey}` : ''}`,
    10_000
  )
  const [sort, setSort] = useState<Sort>('new')

  const rows = useMemo(() => {
    const list = [...(data?.launches ?? [])]
    const num = (v: string | null | undefined) => Number(v ?? 0)
    if (sort === 'cap') list.sort((a, b) => num(b.market?.marketCapUsd ?? b.market?.marketCap) - num(a.market?.marketCapUsd ?? a.market?.marketCap))
    if (sort === 'volume') list.sort((a, b) => num(b.market?.volume24h) - num(a.market?.volume24h))
    return list
  }, [data, sort])

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">Community coins</h2>
        <div className="ml-auto flex gap-1 text-xs">
          {(
            [
              ['new', 'New'],
              ['cap', 'Market cap'],
              ['volume', '24h volume'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)} className={cn('rounded px-2 py-1', sort === k ? 'bg-accent' : 'text-muted-foreground')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Anyone can launch a coin, under any name. These are not verified: check the address, the supply flags and who holds
        it before you buy.
      </p>
      {error && !data && <p className="mt-6 text-sm text-muted-foreground">Launches unavailable: the {network.name} node did not answer.</p>}
      {data && rows.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No community coins yet. Be the first.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((l) => (
          <LaunchCard key={l.token.segment} l={l} height={data?.height ?? null} />
        ))}
      </div>
    </section>
  )
}

function LaunchCard({ l, height }: { l: Launch; height: number | null }) {
  const m = l.market
  const body = (
    <div className={cn('h-full rounded-lg border p-3 transition-colors', m && 'hover:bg-accent/50')}>
      <div className="flex items-start gap-3">
        <TokenBadge asset={l.token} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold">{l.token.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{l.token.symbol}</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">{shortAddress(l.token.address ?? '', 6)}</div>
        </div>
      </div>
      {m ? (
        <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs tabular">
          <span className="text-muted-foreground">Market cap</span>
          <span className="text-right">
            {m.marketCapUsd ? `$${compact(m.marketCapUsd)}` : m.marketCap ? `${compact(m.marketCap)} ${m.quote.symbol}` : '—'}
          </span>
          <span className="text-muted-foreground">Price</span>
          <span className="text-right">
            {fmtPrice(m.price)} {m.quote.symbol}
            {m.priceUsd && <span className="block text-[10px] text-muted-foreground">≈ ${fmtPrice(m.priceUsd)}</span>}
          </span>
          <span className="text-muted-foreground">24h</span>
          <span className={cn('text-right', tone(m.change24h))}>
            {percent(m.change24h)} · vol {compact(m.volume24h)}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No market yet.{' '}
          <Link href={`/launch?token=${l.token.address}`} className="text-primary hover:underline">
            Start one
          </Link>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px]">
        {l.fixedSupply ? (
          <Flag icon={<Lock className="h-3 w-3" />} text="Fixed supply" good />
        ) : (
          <Flag icon={<Lock className="h-3 w-3" />} text="Mintable" />
        )}
        {l.freezable ? (
          <Flag icon={<Snowflake className="h-3 w-3" />} text="Freezable" />
        ) : (
          <Flag icon={<ShieldCheck className="h-3 w-3" />} text="Not freezable" good />
        )}
        <span className="ml-auto text-muted-foreground">
          by <ExplorerLink id={l.creator} label={shortAddress(l.creator, 4)} className="inline-flex font-mono" />
          {height !== null ? ` · ${blocksAgo(height - l.createdHeight)}` : ''}
        </span>
      </div>
    </div>
  )
  return m ? <Link href={m.path}>{body}</Link> : body
}

function blocksAgo(blocks: number) {
  return blocks <= 0 ? 'this block' : blocks === 1 ? '1 block ago' : `${blocks} blocks ago`
}

function Flag({ icon, text, good }: { icon: React.ReactNode; text: string; good?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5', good ? 'border-bid/40 text-bid' : 'border-warn/40 text-warn')}>
      {icon}
      {text}
    </span>
  )
}
