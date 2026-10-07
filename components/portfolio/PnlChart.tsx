'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BaselineSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineSeries,
  LineStyle,
  LineType,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts'
import { useTheme } from 'next-themes'
import { cssColor } from '@/components/trade/PriceChart'
import { compact } from '@/lib/format'
import type { PnlResponse } from '@/lib/types'
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
 * The range's points: cumulative realized PnL (stepping at each realization), starting
 * from where it stood when the range opens, plus "now" with unrealized PnL added.
 */
export function rangePoints(pnl: PnlResponse, range: RangeId, now = Math.floor(Date.now() / 1000)) {
  const span = RANGES.find((r) => r.id === range)!.seconds
  const all = pnl.series.map((p) => ({ time: p.time, value: Number(p.realizedUsd) }))
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
  const total = lastRealized.value + Number(pnl.totals.unrealizedUsd)
  const end = Math.max(now, lastRealized.time + 1)
  return {
    realized,
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
  const { resolvedTheme } = useTheme()
  const [hover, setHover] = useState<{ time: number; value: number } | null>(null)
  const pts = useMemo(() => rangePoints(pnl, range), [pnl, range])

  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: cssColor('--muted-foreground'),
        fontSize: 11,
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
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
    c.subscribeCrosshairMove((p) => {
      if (typeof p.time !== 'number') return setHover(null)
      const d = (p.seriesData.get(tail.current!) ?? p.seriesData.get(line.current!)) as { value?: number } | undefined
      setHover(d?.value !== undefined ? { time: p.time, value: d.value } : null)
    })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [resolvedTheme])

  useEffect(() => {
    if (!line.current || !tail.current || !chart.current) return
    line.current.setData(pts.realized.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
    tail.current.setData(pts.projection.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })))
    chart.current.timeScale().fitContent()
  }, [pts, resolvedTheme])

  const shown = hover ?? { time: pts.projection[1].time, value: pts.end }
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
      </div>
      <div ref={box} className="h-full w-full" />
    </div>
  )
}
