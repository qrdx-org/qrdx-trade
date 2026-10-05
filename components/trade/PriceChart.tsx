'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts'
import { useTheme } from 'next-themes'
import { useApi } from '@/lib/hooks/useApi'
import { priceDecimals } from '@/lib/format'
import type { CandleSeries } from '@/lib/types'
import { cn } from '@/lib/utils'

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const

/** A theme variable ("158 64% 36%") as rgba(), which the chart's colour parser accepts. */
function cssColor(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return 'rgba(136,136,136,1)'
  const m = /([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(getComputedStyle(document.documentElement).getPropertyValue(name))
  if (!m) return `rgba(136,136,136,${alpha})`
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return `rgba(${f(0)},${f(8)},${f(4)},${alpha})`
}

/**
 * Candles from `/candles`: the market's own trades when it has history,
 * otherwise the reference index from public exchanges, labelled as such.
 */
export function PriceChart({ basePath, className }: { basePath: string; className?: string }) {
  const [interval, setInterval_] = useState<(typeof INTERVALS)[number]>('1h')
  const { data, error } = useApi<CandleSeries>(`${basePath}/candles?interval=${interval}&limit=300`, 30_000)
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssColor('--muted-foreground'), fontSize: 11 },
      grid: { vertLines: { color: cssColor('--border', 0.5) }, horzLines: { color: cssColor('--border', 0.5) } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: cssColor('--border') },
      timeScale: { borderColor: cssColor('--border'), timeVisible: true, secondsVisible: false },
    })
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: cssColor('--bid'),
      downColor: cssColor('--ask'),
      wickUpColor: cssColor('--bid'),
      wickDownColor: cssColor('--ask'),
      borderVisible: false,
    })
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [resolvedTheme])

  useEffect(() => {
    if (!candles.current || !volume.current || !data) return
    const rows = data.candles
    const last = Number(rows[rows.length - 1]?.c ?? 1)
    const dp = priceDecimals(last)
    candles.current.applyOptions({ priceFormat: { type: 'price', precision: dp, minMove: Math.pow(10, -dp) } })
    candles.current.setData(
      rows.map((r) => ({ time: r.t as UTCTimestamp, open: +r.o, high: +r.h, low: +r.l, close: +r.c }))
    )
    volume.current.setData(
      rows.map((r) => ({
        time: r.t as UTCTimestamp,
        value: +r.v,
        color: +r.c >= +r.o ? cssColor('--bid', 0.35) : cssColor('--ask', 0.35),
      }))
    )
    // Few candles: keep a normal bar width at the right edge rather than stretching them.
    const ts = chart.current?.timeScale()
    if (rows.length >= 60) ts?.fitContent()
    else {
      ts?.applyOptions({ barSpacing: 10 })
      ts?.scrollToRealTime()
    }
  }, [data, resolvedTheme])

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex items-center gap-1 border-b px-2 py-1">
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => setInterval_(i)}
            className={cn(
              'rounded px-2 py-0.5 text-xs',
              i === interval ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {i}
          </button>
        ))}
        <span className="ml-auto truncate text-[11px] text-muted-foreground" title={data?.exact === false ? 'High and low are bounds derived from two USD series' : undefined}>
          {data?.kind === 'index' ? data.label + (data.exact ? '' : ' · derived') : data?.kind === 'market' ? data.label : ''}
        </span>
      </div>
      <div className="relative flex-1 min-h-[260px]">
        <div ref={box} className="absolute inset-0" />
        {data?.kind === 'none' && (
          <Overlay text="No price history: this market has no trades yet and no public index price." />
        )}
        {error && !data && <Overlay text="Chart unavailable." />}
      </div>
    </div>
  )
}

function Overlay({ text }: { text: string }) {
  return <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted-foreground">{text}</div>
}
