'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
  createChart,
  createTextWatermark,
} from 'lightweight-charts'
import { useTheme } from 'next-themes'
import { CandlestickChart, LineChart } from 'lucide-react'
import { useApi } from '@/lib/hooks/useApi'
import { compact, priceDecimals } from '@/lib/format'
import type { Candle, CandleSeries } from '@/lib/types'
import { cn } from '@/lib/utils'

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
type Kind = 'candles' | 'area'
const KIND_KEY = 'qrdx-trade:chart-kind'

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
 * Candles from `/candles`: the market's own trades or recorded pool prices when
 * it has them, otherwise the reference index from public exchanges, labelled as
 * such. Candles or an area line; hovering shows the bar's OHLC.
 */
export function PriceChart({ basePath, watermark, className }: { basePath: string; watermark?: string; className?: string }) {
  const [interval, setInterval_] = useState<(typeof INTERVALS)[number]>('1h')
  const [kind, setKind] = useState<Kind>('candles')
  const { data, error } = useApi<CandleSeries>(`${basePath}/candles?interval=${interval}&limit=300`, 30_000)
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const area = useRef<ISeriesApi<'Area'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rowsByTime = useRef(new Map<number, Candle>())
  const [hover, setHover] = useState<Candle | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    try {
      const k = localStorage.getItem(KIND_KEY)
      if (k === 'candles' || k === 'area') setKind(k)
    } catch {}
  }, [])
  const pickKind = (k: Kind) => {
    setKind(k)
    try {
      localStorage.setItem(KIND_KEY, k)
    } catch {}
  }

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
      grid: { vertLines: { color: cssColor('--border', 0.45) }, horzLines: { color: cssColor('--border', 0.45) } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: cssColor('--muted-foreground', 0.5), style: LineStyle.Dashed, labelBackgroundColor: cssColor('--foreground') },
        horzLine: { color: cssColor('--muted-foreground', 0.5), style: LineStyle.Dashed, labelBackgroundColor: cssColor('--foreground') },
      },
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
    area.current = c.addSeries(AreaSeries, {
      lineColor: cssColor('--primary'),
      topColor: cssColor('--primary', 0.28),
      bottomColor: cssColor('--primary', 0),
      lineWidth: 2,
      visible: false,
    })
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })
    if (watermark) {
      createTextWatermark(c.panes()[0], {
        horzAlign: 'center',
        vertAlign: 'center',
        lines: [{ text: watermark, color: cssColor('--muted-foreground', 0.09), fontSize: 44, fontStyle: '600' }],
      })
    }
    c.subscribeCrosshairMove((p) => {
      const t = typeof p.time === 'number' ? p.time : null
      setHover(t !== null ? rowsByTime.current.get(t) ?? null : null)
    })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [resolvedTheme, watermark])

  useEffect(() => {
    candles.current?.applyOptions({ visible: kind === 'candles' })
    area.current?.applyOptions({ visible: kind === 'area' })
  }, [kind, resolvedTheme, watermark])

  useEffect(() => {
    if (!candles.current || !area.current || !volume.current || !data) return
    const rows = data.candles
    rowsByTime.current = new Map(rows.map((r) => [r.t, r]))
    const last = Number(rows[rows.length - 1]?.c ?? 1)
    const dp = priceDecimals(last)
    const fmt = { type: 'price' as const, precision: dp, minMove: Math.pow(10, -dp) }
    candles.current.applyOptions({ priceFormat: fmt })
    area.current.applyOptions({ priceFormat: fmt })
    candles.current.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, open: +r.o, high: +r.h, low: +r.l, close: +r.c })))
    area.current.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, value: +r.c })))
    volume.current.setData(
      rows.map((r) => ({
        time: r.t as UTCTimestamp,
        value: +r.v,
        color: +r.c >= +r.o ? cssColor('--bid', 0.3) : cssColor('--ask', 0.3),
      }))
    )
    // Few candles: keep a normal bar width at the right edge rather than stretching them.
    const ts = chart.current?.timeScale()
    if (rows.length >= 60) ts?.fitContent()
    else {
      ts?.applyOptions({ barSpacing: 10 })
      ts?.scrollToRealTime()
    }
  }, [data, resolvedTheme, watermark])

  const shown = hover ?? data?.candles[data.candles.length - 1] ?? null
  const up = shown ? +shown.c >= +shown.o : true
  const dp = priceDecimals(Number(shown?.c ?? 1))
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b px-2">
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => setInterval_(i)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              i === interval ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {i}
          </button>
        ))}
        <span className="mx-1.5 h-4 w-px bg-border" />
        {(
          [
            ['candles', CandlestickChart, 'Candles'],
            ['area', LineChart, 'Line'],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            onClick={() => pickKind(k)}
            aria-label={label}
            title={label}
            className={cn('rounded-md p-1.5 transition-colors', kind === k ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <span
          className="ml-auto truncate pl-2 text-[11px] text-muted-foreground"
          title={data?.exact === false ? 'High and low are bounds derived from two USD series' : undefined}
        >
          {data?.kind === 'index' ? data.label + (data.exact ? '' : ' · derived') : data?.kind === 'market' ? data.label : ''}
        </span>
      </div>
      <div className="relative min-h-[280px] flex-1">
        <div ref={box} className="absolute inset-0" />
        {shown && data?.kind !== 'none' && (
          <div className="num pointer-events-none absolute left-3 top-2 z-10 flex gap-3 text-[11px] text-muted-foreground">
            {(['o', 'h', 'l', 'c'] as const).map((k) => (
              <span key={k}>
                {k.toUpperCase()} <span className={up ? 'text-bid' : 'text-ask'}>{Number(shown[k]).toFixed(dp)}</span>
              </span>
            ))}
            {+shown.v > 0 && (
              <span>
                V <span className="text-foreground/80">{compact(shown.v)}</span>
              </span>
            )}
          </div>
        )}
        {data?.kind === 'none' && <Overlay text="No price history yet: this market has no trades and no public index price." />}
        {error && !data && <Overlay text="Chart unavailable." />}
        {!data && !error && <Overlay text="Loading chart…" />}
      </div>
    </div>
  )
}

function Overlay({ text }: { text: string }) {
  return <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted-foreground">{text}</div>
}
