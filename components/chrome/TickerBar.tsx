'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Star } from 'lucide-react'
import { PairBadge, TokenBadge } from '@/components/trade/TokenBadge'
import { VERIFIED_ASSETS } from '@/lib/assets'
import { percent, price as fmtPrice, tone, usd } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import { useFavorites } from '@/lib/hooks/useFavorites'
import type { IndexPrice, MarketsResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet } from '@/lib/wallet/WalletContext'

type Item =
  | { kind: 'market'; key: string; path: string; label: string; badge: React.ReactNode; price: string | null; change: string | null; fav: boolean; fresh: boolean }
  | { kind: 'index'; key: string; label: string; badge: React.ReactNode; price: string; change: string | null; source: string }

/**
 * The featured strip under the nav: this network's markets (starred first, then
 * by volume, newest community coins tagged), followed by USD index prices from
 * public exchanges, labelled as such. It scrolls; hovering pauses it.
 */
export function TickerBar() {
  const { apiBase } = useNet()
  const markets = useApi<MarketsResponse>(`${apiBase}/markets`, 15_000)
  const prices = useApi<{ prices: Record<string, IndexPrice | null> }>(`${apiBase}/prices`, 60_000)
  const fav = useFavorites()

  const items = useMemo<Item[]>(() => {
    const spot = [...(markets.data?.spot ?? [])].filter((m) => m.status === 'live')
    spot.sort(
      (a, b) =>
        Number(fav.has(b.path)) - Number(fav.has(a.path)) ||
        Number(b.base.verified) - Number(a.base.verified) ||
        Number(b.volume24h ?? 0) - Number(a.volume24h ?? 0)
    )
    const out: Item[] = spot.slice(0, 24).map((m) => ({
      kind: 'market',
      key: m.id,
      path: m.path,
      label: `${m.base.symbol}/${m.quote.symbol}`,
      badge: <PairBadge base={m.base} quote={m.quote} size="xs" />,
      price: m.last,
      change: m.change24h,
      fav: fav.has(m.path),
      fresh: !m.base.verified,
    }))
    for (const p of markets.data?.perps ?? []) {
      out.push({
        kind: 'market',
        key: p.id,
        path: p.path,
        label: `${p.base}-PERP`,
        badge: <TokenBadge asset={p.baseAsset ?? { symbol: p.base, color: '#64748b', verified: true }} size="xs" />,
        price: p.markPrice,
        change: p.change24h,
        fav: fav.has(p.path),
        fresh: false,
      })
    }
    for (const a of VERIFIED_ASSETS) {
      const p = prices.data?.prices[a.slug]
      if (!p || p.source === 'route' || a.usdStable) continue
      out.push({
        kind: 'index',
        key: `idx-${a.slug}`,
        label: a.symbol,
        badge: <TokenBadge asset={{ symbol: a.symbol, color: a.color, verified: true }} size="xs" />,
        price: p.price,
        change: p.change24h,
        source: p.source,
      })
    }
    return out
  }, [markets.data, prices.data, fav])

  if (!items.length) return <div className="h-9 border-b bg-card" aria-hidden />

  // Enough copies to overflow a wide screen, then doubled for a seamless loop.
  const reps = Math.max(1, Math.ceil(14 / items.length))
  const run = Array.from({ length: reps }, () => items).flat()
  return (
    <div className="marquee marquee-fade relative h-9 overflow-hidden border-b bg-card" aria-label="Featured markets">
      <div
        className="animate-marquee flex h-full w-max items-center"
        style={{ ['--marquee-duration' as string]: `${run.length * 4.5}s` }}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {run.map((it, i) => (
              <TickerItem key={`${copy}-${i}-${it.key}`} item={it} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TickerItem({ item }: { item: Item }) {
  const body = (
    <>
      {item.badge}
      <span className="font-medium text-foreground">{item.label}</span>
      {item.kind === 'market' && item.fav && <Star className="h-3 w-3 fill-warn text-warn" />}
      {item.kind === 'market' && item.fresh && (
        <span className="rounded-sm border border-warn/40 px-1 text-[9px] font-semibold uppercase tracking-wide text-warn">New</span>
      )}
      <span className="num text-foreground/90">{item.kind === 'index' ? usd(item.price) : fmtPrice(item.price)}</span>
      <span className={cn('num', tone(item.change))}>{percent(item.change)}</span>
      {item.kind === 'index' && (
        <span className="rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground" title={`USD index price from ${item.source}, not a QRDX price`}>
          index
        </span>
      )}
    </>
  )
  const cls = 'flex h-9 items-center gap-1.5 whitespace-nowrap border-r border-border/60 px-4 text-xs text-muted-foreground transition-colors hover:bg-accent/60'
  return item.kind === 'market' ? (
    <Link href={item.path} className={cls} tabIndex={-1}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  )
}
