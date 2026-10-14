'use client'

import { useMemo, useRef, useState } from 'react'
import { price as fmtPrice, size as fmtSize } from '@/lib/format'
import type { OrderBook } from '@/lib/types'

/**
 * The book as a depth chart: cumulative size (the levels' running totals) against price,
 * bids stepping down to the left of the spread and asks up to the right. Everything plotted
 * is the node's book as the API returns it; nothing is interpolated between levels.
 */
export function DepthChart({ book, baseSymbol, quoteSymbol, onPick }: { book: OrderBook; baseSymbol: string; quoteSymbol: string; onPick?: (price: string) => void }) {
  const box = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; price: number; total: number; side: 'bid' | 'ask' } | null>(null)
  const W = 300
  const H = 200

  const geo = useMemo(() => {
    const bids = book.bids.map(([p, , t]) => [Number(p), Number(t)] as const).filter(([p, t]) => p > 0 && t > 0)
    const asks = book.asks.map(([p, , t]) => [Number(p), Number(t)] as const).filter(([p, t]) => p > 0 && t > 0)
    if (!bids.length && !asks.length) return null
    const prices = [...bids, ...asks].map(([p]) => p)
    const mid = book.mid ? Number(book.mid) : (Math.max(...bids.map(([p]) => p), 0) + Math.min(...asks.map(([p]) => p), Infinity)) / 2
    // Symmetric around the mid, so the spread sits in the middle; a margin keeps the outermost
    // levels' steps inside the frame.
    const half = Math.max(...prices.map((p) => Math.abs(p - mid)), mid * 0.001) * 1.1
    const lo = mid - half
    const hi = mid + half
    const maxTotal = Math.max(...bids.map(([, t]) => t), ...asks.map(([, t]) => t))
    const x = (p: number) => ((p - lo) / (hi - lo)) * W
    const y = (t: number) => H - (t / maxTotal) * (H - 12)
    const step = (levels: (readonly [number, number])[], side: 'bid' | 'ask') => {
      if (!levels.length) return ''
      const edge = side === 'bid' ? 0 : W
      let d = `M ${x(levels[0][0])} ${H}`
      let prevY = H
      for (const [p, t] of levels) {
        d += ` L ${x(p)} ${prevY} L ${x(p)} ${y(t)}`
        prevY = y(t)
      }
      d += ` L ${edge} ${prevY} L ${edge} ${H} Z`
      return d
    }
    return { bids, asks, lo, hi, mid, maxTotal, x, bidPath: step(bids, 'bid'), askPath: step(asks, 'ask') }
  }, [book])

  if (!geo) return <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">The book is empty.</p>

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = box.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const price = geo.lo + (px / W) * (geo.hi - geo.lo)
    const side = price <= geo.mid ? 'bid' : 'ask'
    // The cumulative size available at this price: every level at it or better.
    const levels = side === 'bid' ? geo.bids.filter(([p]) => p >= price) : geo.asks.filter(([p]) => p <= price)
    const total = levels.length ? levels[levels.length - 1][1] : 0
    setHover({ x: px, price, total, side })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-2">
      <svg
        ref={box}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="min-h-0 w-full flex-1 cursor-crosshair touch-none"
        role="img"
        aria-label={`Depth chart: ${geo.bids.length} bid levels, ${geo.asks.length} ask levels`}
        onPointerMove={move}
        onPointerLeave={() => setHover(null)}
        onClick={() => hover && onPick?.(String(Number(hover.price.toPrecision(8))))}
      >
        <path d={geo.bidPath} className="fill-bid/15 stroke-bid" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={geo.askPath} className="fill-ask/15 stroke-ask" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={geo.x(geo.mid)} x2={geo.x(geo.mid)} y1={0} y2={H} className="stroke-border" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        {hover && <line x1={hover.x} x2={hover.x} y1={0} y2={H} className="stroke-foreground/40" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="num mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{fmtPrice(String(geo.lo), geo.mid)}</span>
        <span>mid {fmtPrice(String(geo.mid), geo.mid)}</span>
        <span>{fmtPrice(String(geo.hi), geo.mid)}</span>
      </div>
      {hover && (
        <div className="num pointer-events-none absolute left-4 top-1 rounded border bg-popover px-2 py-1 text-[11px] shadow">
          <div className={hover.side === 'bid' ? 'text-bid' : 'text-ask'}>
            {fmtPrice(String(hover.price), geo.mid)} {quoteSymbol}
          </div>
          <div className="text-muted-foreground">
            {fmtSize(String(hover.total))} {baseSymbol} {hover.side === 'bid' ? 'bid at or above' : 'offered at or below'}
          </div>
        </div>
      )}
    </div>
  )
}
