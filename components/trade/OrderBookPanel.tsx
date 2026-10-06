'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { fixed, price as fmtPrice, size as fmtSize } from '@/lib/format'
import type { OrderBook } from '@/lib/types'
import { cn } from '@/lib/utils'

type View = 'both' | 'bids' | 'asks'

/**
 * The node's book, re-oriented to the market. Asks on top (best nearest the
 * spread), bids below; bars show cumulative size. Clicking a level fills the
 * order form's price. One side can take the whole panel.
 */
export function OrderBookPanel({
  book,
  error,
  baseSymbol,
  quoteSymbol,
  onPick,
  mark,
}: {
  book: OrderBook | null
  error: Error | null
  baseSymbol: string
  quoteSymbol: string
  onPick?: (price: string) => void
  /** Perps: mark price, shown in the mid row's tooltip (the market bar shows it too). */
  mark?: string | null
}) {
  const [view, setView] = useState<View>('both')
  // As many whole rows as the panel has room for, per side.
  const askBox = useRef<HTMLDivElement>(null)
  const bidBox = useRef<HTMLDivElement>(null)
  const askFit = useFitRows(askBox)
  const bidFit = useFitRows(bidBox)
  const rows = Math.max(1, view === 'bids' ? bidFit : view === 'asks' ? askFit : Math.min(askFit, bidFit))
  const ref = Number(book?.mid ?? book?.bestBid ?? book?.bestAsk ?? 1)
  const asks = useMemo(() => (book?.asks ?? []).slice(0, rows).reverse(), [book, rows])
  const bids = useMemo(() => (book?.bids ?? []).slice(0, rows), [book, rows])
  const maxTotal = Math.max(
    Number(book?.asks[Math.min(rows, book.asks.length) - 1]?.[2] ?? 0),
    Number(book?.bids[Math.min(rows, book.bids.length) - 1]?.[2] ?? 0),
    1e-18
  )
  const dir = useDirection(book?.mid ?? null)

  const Row = ({ level, side }: { level: [string, string, string]; side: 'bid' | 'ask' }) => {
    const pct = Math.min(100, (Number(level[2]) / maxTotal) * 100)
    return (
      <button
        type="button"
        onClick={() => onPick?.(level[0])}
        className="group relative grid h-[19px] w-full grid-cols-3 items-center px-3 text-right text-xs num transition-colors hover:bg-accent/70"
        title={onPick ? 'Use this price' : undefined}
      >
        <span className={cn('absolute inset-y-px right-0 transition-[width] duration-300', side === 'bid' ? 'bg-bid/10' : 'bg-ask/10')} style={{ width: `${pct}%` }} />
        <span className={cn('relative text-left font-medium', side === 'bid' ? 'text-bid' : 'text-ask')}>{fmtPrice(level[0], ref)}</span>
        <span className="relative">{fmtSize(level[1])}</span>
        <span className="relative text-muted-foreground">{fmtSize(level[2])}</span>
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex gap-1">
          {(['both', 'bids', 'asks'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-label={v === 'both' ? 'Bids and asks' : v === 'bids' ? 'Bids only' : 'Asks only'}
              title={v === 'both' ? 'Bids and asks' : v === 'bids' ? 'Bids only' : 'Asks only'}
              className={cn('flex h-6 w-6 flex-col justify-center gap-[2px] rounded p-1 transition-colors', view === v ? 'bg-accent' : 'opacity-50 hover:opacity-100')}
            >
              <span className={cn('h-[3px] rounded-sm', v === 'bids' ? 'bg-bid' : 'bg-ask')} />
              <span className={cn('h-[3px] rounded-sm', v === 'asks' ? 'bg-ask' : v === 'bids' ? 'bg-bid' : 'bg-ask')} />
              <span className={cn('h-[3px] rounded-sm', v === 'asks' ? 'bg-ask' : 'bg-bid')} />
              <span className={cn('h-[3px] rounded-sm', v === 'asks' ? 'bg-ask' : 'bg-bid')} />
            </button>
          ))}
        </div>
        {book?.spreadBps && <span className="num text-[11px] text-muted-foreground">Spread {fixed(String(Number(book.spreadBps) / 100), 3)}%</span>}
      </div>
      <div className="grid grid-cols-3 px-3 py-1.5 text-right text-[11px] text-muted-foreground">
        <span className="text-left">Price ({quoteSymbol})</span>
        <span>Size ({baseSymbol})</span>
        <span>Total</span>
      </div>
      {error && !book ? (
        <Empty text="Order book unavailable: the QRDX node did not answer." />
      ) : !book ? (
        <Skeleton />
      ) : (
        <>
          {view !== 'bids' && (
            <div ref={askBox} className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
              {asks.length ? asks.map((l) => <Row key={`a${l[0]}`} level={l} side="ask" />) : <Empty text="No asks" small />}
            </div>
          )}
          <div className="flex items-center justify-between border-y bg-muted/40 px-3 py-1.5 num">
            <span
              className={cn('flex items-center gap-1 text-sm font-semibold', dir === 'up' ? 'text-bid' : dir === 'down' ? 'text-ask' : 'text-foreground')}
              title={mark ? `Mark ${fmtPrice(mark, ref)}` : 'Mid price'}
            >
              {book.mid ? fmtPrice(book.mid, ref) : '—'}
              {dir === 'up' && <ArrowUp className="h-3.5 w-3.5" />}
              {dir === 'down' && <ArrowDown className="h-3.5 w-3.5" />}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {book.spread ? `${fmtPrice(book.spread, ref)} spread` : 'no spread'}
            </span>
          </div>
          {view !== 'asks' && (
            <div ref={bidBox} className="min-h-0 flex-1 overflow-hidden">
              {bids.length ? bids.map((l) => <Row key={`b${l[0]}`} level={l} side="bid" />) : <Empty text="No bids" small />}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const ROW_PX = 19

/** How many book rows fit in the element. */
function useFitRows(ref: React.RefObject<HTMLDivElement | null>): number {
  const [n, setN] = useState(12)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setN(Math.max(1, Math.floor(el.clientHeight / ROW_PX))))
    ro.observe(el)
    return () => ro.disconnect()
  })
  return n
}

/** Whether the mid last moved up or down. */
function useDirection(mid: string | null): 'up' | 'down' | null {
  const prev = useRef<{ v: number; dir: 'up' | 'down' | null }>({ v: NaN, dir: null })
  if (mid !== null) {
    const v = Number(mid)
    if (!Number.isNaN(prev.current.v) && v !== prev.current.v) prev.current.dir = v > prev.current.v ? 'up' : 'down'
    prev.current.v = v
  }
  return prev.current.dir
}

function Skeleton() {
  return (
    <div className="flex-1 space-y-1 px-3 py-2">
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="h-3.5 animate-pulse rounded bg-muted/60" style={{ opacity: 1 - i * 0.05 }} />
      ))}
    </div>
  )
}

function Empty({ text, small }: { text: string; small?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center px-3 text-center text-xs text-muted-foreground', small ? 'py-4' : 'flex-1 py-10')}>
      {text}
    </div>
  )
}
