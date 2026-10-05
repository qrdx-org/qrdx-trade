'use client'

import { useMemo } from 'react'
import { fixed, price as fmtPrice, size as fmtSize } from '@/lib/format'
import type { OrderBook } from '@/lib/types'
import { cn } from '@/lib/utils'

const ROWS = 12

/**
 * The node's book, re-oriented to the market. Asks on top (best nearest the
 * spread), bids below; bars show cumulative size. Clicking a level fills the
 * order form's price.
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
  const ref = Number(book?.mid ?? book?.bestBid ?? book?.bestAsk ?? 1)
  const asks = useMemo(() => (book?.asks ?? []).slice(0, ROWS).reverse(), [book])
  const bids = useMemo(() => (book?.bids ?? []).slice(0, ROWS), [book])
  const maxTotal = Math.max(
    Number(book?.asks[Math.min(ROWS, book.asks.length) - 1]?.[2] ?? 0),
    Number(book?.bids[Math.min(ROWS, book.bids.length) - 1]?.[2] ?? 0),
    1e-18
  )

  const Row = ({ level, side }: { level: [string, string, string]; side: 'bid' | 'ask' }) => {
    const pct = Math.min(100, (Number(level[2]) / maxTotal) * 100)
    return (
      <button
        type="button"
        onClick={() => onPick?.(level[0])}
        className="relative grid w-full grid-cols-3 px-2 py-[1px] text-right text-xs tabular hover:bg-accent/60"
      >
        <span
          className={cn('absolute inset-y-0 right-0', side === 'bid' ? 'bg-bid/12' : 'bg-ask/12')}
          style={{ width: `${pct}%` }}
        />
        <span className={cn('relative text-left', side === 'bid' ? 'text-bid' : 'text-ask')}>
          {fmtPrice(level[0], ref)}
        </span>
        <span className="relative">{fmtSize(level[1])}</span>
        <span className="relative text-muted-foreground">{fmtSize(level[2])}</span>
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 px-2 py-1 text-right text-[11px] text-muted-foreground">
        <span className="text-left">Price ({quoteSymbol})</span>
        <span>Size ({baseSymbol})</span>
        <span>Total</span>
      </div>
      {error && !book ? (
        <Empty text="Order book unavailable: the QRDX node did not answer." />
      ) : !book ? (
        <Empty text="Loading…" />
      ) : (
        <>
          <div className="flex flex-1 flex-col justify-end overflow-hidden">
            {asks.length ? asks.map((l) => <Row key={`a${l[0]}`} level={l} side="ask" />) : <Empty text="No asks" small />}
          </div>
          <div className="flex items-center justify-between border-y bg-muted/30 px-2 py-1 text-xs tabular">
            <span className="font-semibold" title={mark ? `Mark ${fmtPrice(mark, ref)}` : 'Mid price'}>
              {book.mid ? fmtPrice(book.mid, ref) : '—'}
            </span>
            <span className="text-muted-foreground">
              Spread {book.spread ? fmtPrice(book.spread, ref) : '—'}
              {book.spreadBps ? ` (${fixed(String(Number(book.spreadBps) / 100), 3)}%)` : ''}
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            {bids.length ? bids.map((l) => <Row key={`b${l[0]}`} level={l} side="bid" />) : <Empty text="No bids" small />}
          </div>
        </>
      )}
    </div>
  )
}

function Empty({ text, small }: { text: string; small?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center px-3 text-center text-xs text-muted-foreground', small ? 'py-3' : 'flex-1 py-10')}>
      {text}
    </div>
  )
}
