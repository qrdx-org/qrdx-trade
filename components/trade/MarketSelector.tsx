'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Search, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PairBadge, TokenBadge } from '@/components/trade/TokenBadge'
import { isTokenAddress } from '@/lib/assets'
import { useApi } from '@/lib/hooks/useApi'
import { useFavorites } from '@/lib/hooks/useFavorites'
import { compact, percent, price as fmtPrice, tone } from '@/lib/format'
import type { MarketsResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet } from '@/lib/wallet/WalletContext'

/** Opens the market search from anywhere (the nav's search button, ⌘K / Ctrl+K, "/"). */
export const OPEN_SEARCH = 'qrdx:open-market-search'
export const openMarketSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH))

/** The global market search dialog. Mounted once, in the nav. */
export function MarketSearch() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener(OPEN_SEARCH, show)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(OPEN_SEARCH, show)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose className="top-[12vh] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=open]:slide-in-from-top-[10vh]">
        <DialogTitle className="sr-only">Search markets</DialogTitle>
        {open && <MarketList onPick={() => setOpen(false)} autoFocus />}
      </DialogContent>
    </Dialog>
  )
}

/** The pair button in a market header: opens the market search. */
export function MarketSelector({ label, sub, children }: { label: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <button onClick={openMarketSearch} className="group flex items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent">
      {children}
      <span className="leading-tight">
        <span className="flex items-center gap-1 text-lg font-semibold tracking-tight">
          {label}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
        </span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </button>
  )
}

type Tab = 'favorites' | 'spot' | 'perps' | 'new'
const TABS: { id: Tab; label: string }[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'spot', label: 'Spot' },
  { id: 'perps', label: 'Perps' },
  { id: 'new', label: 'Community' },
]

export function MarketList({ onPick, dense = true, autoFocus }: { onPick?: () => void; dense?: boolean; autoFocus?: boolean }) {
  const { apiBase } = useNet()
  const router = useRouter()
  const { data, error } = useApi<MarketsResponse>(`${apiBase}/markets`, 10_000)
  const fav = useFavorites()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('spot')
  const [cursor, setCursor] = useState(0)

  const all = useMemo(() => {
    const spot = (data?.spot ?? []).map((m) => ({
      key: m.id,
      path: m.path,
      kind: 'spot' as const,
      name: `${m.base.symbol}/${m.quote.symbol}`,
      sub: m.base.verified ? m.base.name : `Unverified · ${m.base.address?.slice(0, 10)}…`,
      search: [m.base.symbol, m.quote.symbol, m.base.name, m.base.address ?? '', m.quote.address ?? ''],
      badge: <PairBadge base={m.base} quote={m.quote} size="sm" />,
      last: m.last,
      change: m.change24h,
      volume: m.volume24h,
      verified: m.base.verified && m.quote.verified,
    }))
    const perps = (data?.perps ?? []).map((m) => ({
      key: m.id,
      path: m.path,
      kind: 'perp' as const,
      name: `${m.base}-${m.quote}`,
      sub: `Perpetual · up to ${m.maxLeverage ? Number(m.maxLeverage) : '—'}×`,
      search: [m.id, m.base, m.quote],
      badge: <TokenBadge asset={m.baseAsset ?? { symbol: m.base, color: '#64748b', verified: true }} size="md" />,
      last: m.markPrice,
      change: m.change24h,
      volume: m.volume24h,
      verified: true,
    }))
    return { spot, perps }
  }, [data])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pool =
      tab === 'perps'
        ? all.perps
        : tab === 'favorites'
          ? [...all.spot, ...all.perps].filter((r) => fav.has(r.path))
          : tab === 'new'
            ? all.spot.filter((r) => !r.verified)
            : all.spot
    return pool
      .filter((r) => !needle || r.search.some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.verified) - Number(a.verified) || Number(b.volume ?? 0) - Number(a.volume ?? 0))
  }, [all, q, tab, fav])

  useEffect(() => setCursor(0), [q, tab])

  const go = (path: string) => {
    onPick?.()
    router.push(path)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(rows.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      if (isTokenAddress(q.trim()) && !rows.length) go(`/trade/${q.trim().toLowerCase()}`)
      else if (rows[cursor]) go(rows[cursor].path)
    }
  }

  const cols = dense ? 'grid-cols-[20px_1fr_auto_auto]' : 'grid-cols-[20px_1fr_auto_auto_auto]'
  return (
    <div className={cn('flex flex-col', dense && 'max-h-[70vh]')} onKeyDown={onKey}>
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by symbol, name or token address"
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {dense && <kbd className="rounded border px-1.5 text-[10px] text-muted-foreground">Esc</kbd>}
      </div>
      <div className="flex gap-1 border-b px-3 py-2 text-xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
              tab === t.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.id === 'favorites' && <Star className={cn('h-3 w-3', tab === t.id && 'fill-warn text-warn')} />}
            {t.label}
          </button>
        ))}
      </div>
      {isTokenAddress(q.trim()) && tab !== 'perps' && (
        <button onClick={() => go(`/trade/${q.trim().toLowerCase()}`)} className="border-b px-4 py-2.5 text-left text-sm hover:bg-accent">
          Open token <span className="font-mono text-xs">{q.trim()}</span>
        </button>
      )}
      <div className={cn('grid gap-x-4 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground', cols)}>
        <span />
        <span>Market</span>
        <span className="text-right">Price</span>
        <span className="w-16 text-right">24h</span>
        {!dense && <span className="w-24 text-right">Volume</span>}
      </div>
      <div className="overflow-y-auto">
        {error && !data && <Empty>Markets unavailable.</Empty>}
        {data && !data.nodeOk && <Empty>The QRDX node is unreachable.</Empty>}
        {data && data.nodeOk && rows.length === 0 && (
          <Empty>{tab === 'favorites' ? 'Star a market to keep it here.' : q ? 'Nothing matches.' : 'No markets yet.'}</Empty>
        )}
        {rows.map((r, i) => (
          <div
            key={r.key}
            role="button"
            tabIndex={-1}
            onClick={() => go(r.path)}
            onMouseEnter={() => setCursor(i)}
            className={cn('grid cursor-pointer items-center gap-x-4 px-4 py-2.5 text-sm transition-colors', cols, i === cursor && 'bg-accent')}
          >
            <button
              aria-label={fav.has(r.path) ? 'Remove from favorites' : 'Add to favorites'}
              onClick={(e) => {
                e.stopPropagation()
                fav.toggle(r.path)
              }}
              className="text-muted-foreground hover:text-warn"
            >
              <Star className={cn('h-3.5 w-3.5', fav.has(r.path) && 'fill-warn text-warn')} />
            </button>
            <span className="flex min-w-0 items-center gap-2.5">
              {r.badge}
              <span className="min-w-0">
                <span className="block font-medium">{r.name}</span>
                <span className={cn('block truncate text-[11px]', r.verified ? 'text-muted-foreground' : 'text-warn')}>{r.sub}</span>
              </span>
            </span>
            <span className="num text-right">{fmtPrice(r.last)}</span>
            <span className={cn('num w-16 text-right', tone(r.change))}>{percent(r.change)}</span>
            {!dense && <span className="num w-24 text-right text-muted-foreground">{compact(r.volume)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-10 text-center text-sm text-muted-foreground">{children}</p>
}
