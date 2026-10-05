'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PairBadge, TokenBadge } from '@/components/trade/TokenBadge'
import { isTokenAddress } from '@/lib/assets'
import { useApi } from '@/lib/hooks/useApi'
import { compact, percent, price as fmtPrice, tone } from '@/lib/format'
import type { MarketsResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet } from '@/lib/wallet/WalletContext'

/** The pair button in the market bar; opens a searchable list of every market. */
export function MarketSelector({ label, children }: { label: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-lg font-semibold hover:bg-accent"
      >
        {children}
        {label}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">Markets</DialogTitle>
          {open && <MarketList onPick={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function MarketList({ onPick, dense = true }: { onPick?: () => void; dense?: boolean }) {
  const { apiBase } = useNet()
  const router = useRouter()
  const { data, error } = useApi<MarketsResponse>(`${apiBase}/markets`, 10_000)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'spot' | 'perps'>('spot')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (tab === 'perps') {
      return (data?.perps ?? [])
        .filter((m) => !needle || m.id.toLowerCase().includes(needle))
        .map((m) => ({
          key: m.id,
          path: m.path,
          name: `${m.base}-${m.quote}`,
          sub: 'Perpetual',
          badge: <TokenBadge asset={m.baseAsset ?? { symbol: m.base, color: '#888', verified: true }} size="md" />,
          last: m.markPrice,
          change: m.change24h,
          volume: m.volume24h,
          verified: true,
        }))
    }
    return (data?.spot ?? [])
      .filter(
        (m) =>
          !needle ||
          [m.base.symbol, m.quote.symbol, m.base.name, m.base.address ?? '', m.quote.address ?? '']
            .some((s) => s.toLowerCase().includes(needle))
      )
      .sort((a, b) => Number(b.base.verified) - Number(a.base.verified) || Number(b.volume24h ?? 0) - Number(a.volume24h ?? 0))
      .map((m) => ({
        key: m.id,
        path: m.path,
        name: `${m.base.symbol}/${m.quote.symbol}`,
        sub: m.base.verified ? m.base.name : `Unverified · ${m.base.address?.slice(0, 10)}…`,
        badge: <PairBadge base={m.base} quote={m.quote} size="sm" />,
        last: m.last,
        change: m.change24h,
        volume: m.volume24h,
        verified: m.base.verified && m.quote.verified,
      }))
  }, [data, q, tab])

  const go = (path: string) => {
    onPick?.()
    router.push(path)
  }

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by symbol, name or token address"
          className="h-8 border-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex gap-1 border-b px-3 py-1.5 text-sm">
        {(['spot', 'perps'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('rounded px-2 py-0.5', tab === t ? 'bg-accent' : 'text-muted-foreground')}
          >
            {t === 'spot' ? 'Spot' : 'Perps'}
          </button>
        ))}
      </div>
      {isTokenAddress(q.trim()) && tab === 'spot' && (
        <button onClick={() => go(`/trade/${q.trim().toLowerCase()}`)} className="border-b px-4 py-2 text-left text-sm hover:bg-accent">
          Open token <span className="font-mono">{q.trim().slice(0, 12)}…</span>
        </button>
      )}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-1 text-[11px] text-muted-foreground">
        <span>Market</span>
        <span className="text-right">Last</span>
        <span className="text-right w-16">24h</span>
        <span className={cn('text-right w-20', dense && 'hidden sm:block')}>Volume</span>
      </div>
      <div className="overflow-y-auto">
        {error && !data && <p className="p-6 text-center text-sm text-muted-foreground">Markets unavailable.</p>}
        {data && !data.nodeOk && <p className="p-6 text-center text-sm text-muted-foreground">The QRDX node is unreachable.</p>}
        {data && data.nodeOk && rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No markets.</p>}
        {rows.map((r) => (
          <button
            key={r.key}
            onClick={() => go(r.path)}
            className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-2 text-left text-sm hover:bg-accent"
          >
            <span className="flex items-center gap-2 min-w-0">
              {r.badge}
              <span className="min-w-0">
                <span className="block font-medium">{r.name}</span>
                <span className={cn('block truncate text-[11px]', r.verified ? 'text-muted-foreground' : 'text-amber-500')}>{r.sub}</span>
              </span>
            </span>
            <span className="text-right tabular">{fmtPrice(r.last)}</span>
            <span className={cn('w-16 text-right tabular', tone(r.change))}>{percent(r.change)}</span>
            <span className={cn('w-20 text-right tabular text-muted-foreground', dense && 'hidden sm:block')}>{compact(r.volume)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
