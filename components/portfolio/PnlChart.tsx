'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BaselineSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineSeries,
  LineStyle,
  LineType,
  UTCTimestamp,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import { useTheme } from 'next-themes'
import { cssColor } from '@/components/trade/PriceChart'
import { compact, price as fmtPrice, size as fmtSize } from '@/lib/format'
import type { PnlResponse, PnlTrade } from '@/lib/types'
import { cn } from '@/lib/utils'

export const RANGES = [
  { id: '24h', label: '24H', seconds: 86_400 },
  { id: '7d', label: '7D', seconds: 7 * 86_400 },
  { id: '30d', label: '30D', seconds: 30 * 86_400 },
  { id: 'all', label: 'All', seconds: Infinity },
] as const
export type RangeId = (typeof RANGES)[number]['id']

interface Point {
  time: number
  value: number
}

/**
 * The range's points: PnL as it stood after each trade or realization (realized so far, plus
 * spot positions marked at their trade then), starting from where it stood when the range opens,
 * plus "now" with every open position marked at today's prices.
 */
export function rangePoints(pnl: PnlResponse, range: RangeId, now = Math.floor(Date.now() / 1000)) {
  const span = RANGES.find((r) => r.id === range)!.seconds
  const all = pnl.series.map((p) => ({ time: p.time, value: Number(p.pnlUsd ?? p.realizedUsd) }))
  const from = Number.isFinite(span) ? now - span : Math.min(all[0]?.time ?? now, now) - 60
  let start = 0
  const inRange: Point[] = []
  for (const p of all) {
    if (p.time < from) start = p.value
    else inRange.push(p)
  }
  const realized: Point[] = [{ time: from, value: start }]
  for (const p of inRange) {
    if (p.time <= realized[realized.length - 1].time) realized[realized.length - 1] = { time: realized[realized.length - 1].time, value: p.value }
    else realized.push(p)
  }
  const lastRealized = realized[realized.length - 1]
  const total = Number(pnl.totals.pnlUsd)
  const end = Math.max(now, lastRealized.time + 1)
  const trades = (pnl.trades ?? []).filter((t) => t.time >= from)
  return {
    realized,
    trades,
    projection: [lastRealized, { time: end, value: total }],
    start,
    end: total,
    change: total - start,
  }
}

export function PnlChart({ pnl, range, className }: { pnl: PnlResponse; range: RangeId; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const line = useRef<ISeriesApi<'Baseline'> | null>(null)
  const tail = useRef<ISeriesApi<'Line'> | null>(null)
  const marks = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null)
  const { resolvedTheme } = useTheme()
  const [hover, setHover] = useState<{ time: number; value: number } | null>(null)
  const tradesAt = useMemo(() => {
    const m = new Map<number, PnlTrade[]>()
    for (const t of pnl.trades ?? []) m.set(t.time, [...(m.get(t.time) ?? []), t])
    return m
  }, [pnl.trades])
  const pts = useMemo(() => rangePoints(pnl, range), [pnl, range])

  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: cssColor('--muted-foreground'),
        fontSize: 11,
        // A canvas cannot resolve CSS variables: hand it the page's resolved font stack.
        fontFamily: getComputedStyle(document.body).fontFamily,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: cssColor('--border', 0.45) } },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: cssColor('--muted-foreground', 0.5), style: LineStyle.Dashed, labelBackgroundColor: cssColor('--foreground') },
        horzLine: { color: cssColor('--muted-foreground', 0.5), style: LineStyle.Dashed, labelBackgroundColor: cssColor('--foreground') },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: (v: number) => compact(v, '$') },
      handleScroll: false,
      handleScale: false,
    })
    line.current = c.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 0 },
      lineType: LineType.WithSteps,
      lineWidth: 2,
      topLineColor: cssColor('--bid'),
      topFillColor1: cssColor('--bid', 0.28),
      topFillColor2: cssColor('--bid', 0.02),
      bottomLineColor: cssColor('--ask'),
      bottomFillColor1: cssColor('--ask', 0.02),
      bottomFillColor2: cssColor('--ask', 0.28),
      priceLineVisible: false,
      lastValueVisible: false,
    })
    tail.current = c.addSeries(LineSeries, {
      color: cssColor('--muted-foreground', 0.9),
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    })
    marks.current = createSeriesMarkers(line.current, [], { zOrder: 'aboveSeries' }) as ISeriesMarkersPluginApi<UTCTimestamp>
    c.subscribeCrosshairMove((p) => {
      if (typeof p.time !== 'number') return setHover(null)
      const d = (p.seriesData.get(tail.current!) ?? p.seriesData.get(line.current!)) as { value?: number } | undefined
      setHover(d?.value !== undefined ? { time: p.time, value: d.value } : null)
    })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      marks.current = null
    }
  }, [resolvedTheme])

  useEffect(() => {
    if (!line.current || !tail.current || !chart.current) return
    line.current.setData(pts.realized.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
    tail.current.setData(pts.projection.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
    // A spot trade: an arrow up under the line for a buy, down over it for a sell.
    marks.current?.setMarkers(
      pts.trades.map((t) => ({
        time: t.time as UTCTimestamp,
        position: t.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
        shape: t.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
        color: cssColor(t.side === 'buy' ? '--bid' : '--ask'),
        size: 0.8,
      }))
    )
    chart.current.timeScale().fitContent()
  }, [pts, resolvedTheme])

  const shown = hover ?? { time: pts.projection[1].time, value: pts.end }
  const hoverTrades = hover ? (tradesAt.get(hover.time) ?? []) : []
  return (
    <div className={cn('relative', className)}>
      <div className="pointer-events-none absolute left-3 top-2 z-10 text-xs">
        <span className={cn('num font-semibold', shown.value > 0 ? 'text-bid' : shown.value < 0 ? 'text-ask' : 'text-muted-foreground')}>
          {shown.value > 0 ? '+' : ''}
          {compact(shown.value, '$')}
        </span>
        <span className="ml-2 text-muted-foreground">
          {hover ? new Date(hover.time * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'now, incl. unrealized'}
        </span>
        {hoverTrades.map((t, i) => (
          <div key={i} className="num mt-0.5 text-[11px] text-muted-foreground">
            <span className={t.side === 'buy' ? 'text-bid' : 'text-ask'}>{t.side === 'buy' ? 'Bought' : 'Sold'}</span> {fmtSize(t.amount)} {t.base} at {fmtPrice(t.price)} {t.quote}
          </div>
        ))}
      </div>
      <div ref={box} className="h-full w-full" />
    </div>
  )
}
