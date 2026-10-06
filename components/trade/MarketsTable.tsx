'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowUpRight, Flame, Rocket, TrendingUp } from 'lucide-react'
import { MarketList } from '@/components/trade/MarketSelector'
import { PairBadge, TokenBadge } from '@/components/trade/TokenBadge'
import { VERIFIED_ASSETS } from '@/lib/assets'
import { dec, mul, div, str } from '@/lib/decimal'
import { compact, percent, price as fmtPrice, tone, usd } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { IndexPrice, Launch, MarketsResponse, SpotMarket } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet } from '@/lib/wallet/WalletContext'

/** A spot market's 24 h volume in USD: quote volume ÷ price × the base's USD price. Null when any part is unknown. */
function volumeUsd(m: SpotMarket): string | null {
  if (!m.volume24h || !m.last || !m.baseUsd || dec(m.last) <= 0n) return null
  return str(mul(div(dec(m.volume24h), dec(m.last)), dec(m.baseUsd.price)))
}

export function MarketsTable() {
  const { apiBase, network, slot } = useNet()
  const markets = useApi<MarketsResponse>(`${apiBase}/markets`, 10_000)
  const prices = useApi<{ prices: Record<string, IndexPrice | null> }>(`${apiBase}/prices`, 30_000)
  const launches = useApi<{ launches: Launch[] }>(`${apiBase}/launches?limit=12`, 30_000)
  const listed = VERIFIED_ASSETS.filter((a) => {
    const p = prices.data?.prices[a.slug]
    return p && p.source !== 'route'
  })

  const spot = useMemo(() => (markets.data?.spot ?? []).filter((m) => m.status === 'live'), [markets.data])
  const summary = useMemo(() => {
    let vol = 0n
    let priced = 0
    for (const m of spot) {
      const v = volumeUsd(m)
      if (v) {
        vol += dec(v)
        priced++
      }
    }
    return {
      volume: priced ? str(vol) : null,
      community: spot.filter((m) => !m.base.verified).length,
    }
  }, [spot])
  const topVolume = useMemo(
    () => spot.filter((m) => Number(m.volume24h ?? 0) > 0).sort((a, b) => Number(volumeUsd(b) ?? 0) - Number(volumeUsd(a) ?? 0)).slice(0, 4),
    [spot]
  )
  const movers = useMemo(
    () => spot.filter((m) => m.change24h !== null && Number(m.change24h) !== 0).sort((a, b) => Math.abs(Number(b.change24h)) - Math.abs(Number(a.change24h))).slice(0, 4),
    [spot]
  )
  const fresh = (launches.data?.launches ?? []).filter((l) => l.market).slice(0, 4)

  return (
    <div>
      <section className="hero-glow border-b">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {slot === 'test' ? `${network.name} · test tokens` : network.name}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Markets</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Spot pairs and perpetuals on the QRDX chain. Order books, pool prices and fills come from the chain itself; USD index prices
                from public exchanges are marked as reference.
              </p>
            </div>
            <Link
              href="/launch"
              className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/30"
            >
              <Rocket className="h-4 w-4" /> Launch a coin
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
            <Summary label="24h volume" value={summary.volume ? `≈ ${usd(summary.volume)}` : '—'} hint="Valued at each base asset's USD price" />
            <Summary label="Spot markets" value={markets.data ? String(spot.length) : '—'} />
            <Summary label="Perpetuals" value={markets.data ? String(markets.data.perps.length) : '—'} />
            <Summary label="Community coins" value={markets.data ? String(summary.community) : '—'} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Highlight title="Most traded" icon={<Flame className="h-4 w-4" />}>
            {topVolume.map((m) => (
              <MiniRow key={m.id} m={m} right={<span className="num text-muted-foreground">{volumeUsd(m) ? compact(volumeUsd(m), '$') : compact(m.volume24h)}</span>} />
            ))}
          </Highlight>
          <Highlight title="Biggest moves, 24h" icon={<TrendingUp className="h-4 w-4" />}>
            {movers.map((m) => (
              <MiniRow key={m.id} m={m} right={<span className={cn('num font-medium', tone(m.change24h))}>{percent(m.change24h)}</span>} />
            ))}
          </Highlight>
          <Highlight title="New coins" icon={<Rocket className="h-4 w-4" />} href="/launch">
            {fresh.map((l) => (
              <Link key={l.token.segment} href={l.market!.path} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <span className="flex min-w-0 items-center gap-2">
                  <TokenBadge asset={l.token} size="sm" />
                  <span className="truncate font-medium">{l.token.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{l.token.name}</span>
                </span>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {l.market!.priceUsd ? `$${fmtPrice(l.market!.priceUsd, Number(l.market!.priceUsd))}` : `${fmtPrice(l.market!.price)} ${l.market!.quote.symbol}`}
                </span>
              </Link>
            ))}
          </Highlight>
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border bg-card">
          <MarketList dense={false} />
        </section>

        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Index prices</h2>
            <span className="text-xs text-muted-foreground">Reference only · not QRDX order-book prices</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {listed.map((a) => {
              const p = prices.data!.prices[a.slug]!
              return (
                <div key={a.slug} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                  <TokenBadge asset={{ symbol: a.symbol, color: a.color, verified: true, slug: a.slug }} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{a.symbol}</span>
                      <span className="num">{usd(p.price)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span className="capitalize">{p.source}</span>
                      <span className={cn('num', tone(p.change24h))}>{percent(p.change24h)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {prices.error && !prices.data && <p className="text-xs text-muted-foreground">Index prices unavailable.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card px-5 py-4" title={hint}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function Highlight({ title, icon, href, children }: { title: string; icon: React.ReactNode; href?: string; children: React.ReactNode }) {
  const empty = !(Array.isArray(children) ? children.length : children)
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-1 flex items-center justify-between px-2 pt-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-primary">{icon}</span>
          {title}
        </h3>
        {href && (
          <Link href={href} className="flex items-center text-xs text-muted-foreground hover:text-foreground">
            All <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {empty ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing yet.</p> : children}
    </div>
  )
}

function MiniRow({ m, right }: { m: SpotMarket; right: React.ReactNode }) {
  return (
    <Link href={m.path} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <span className="flex items-center gap-2">
        <PairBadge base={m.base} quote={m.quote} size="sm" />
        <span className="font-medium">
          {m.base.symbol}
          <span className="text-muted-foreground">/{m.quote.symbol}</span>
        </span>
      </span>
      <span className="flex items-center gap-3 text-xs">
        <span className="num">{fmtPrice(m.last)}</span>
        {right}
      </span>
    </Link>
  )
}
