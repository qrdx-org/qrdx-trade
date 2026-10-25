'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { Bell, Crosshair, Minus, PenLine, ShieldAlert, Target, Trash2, X } from 'lucide-react'
import { addAlert } from '@/lib/alerts'
import { price as fmtPrice } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Drawings on the price chart: trend lines, horizontal levels, and take-profit and stop-loss
 * levels, kept in this browser per market and per unit (a level in QRDX is not a level in USD).
 *
 * Take-profit and stop-loss levels become real orders where the node has trigger orders
 * (docs/TRADING_FEATURES.md §3): with an open perps position, a position TP/SL (PERP_TRIGGER
 * `position: true`, closing all of it on the mark); otherwise the order form's Stop tab gets the
 * level as its trigger. On an older node they stay planning levels: a take-profit can become a
 * limit order, and either level can raise a price alert while the site is open.
 */

export type Tool = 'cursor' | 'trend' | 'hline' | 'tp' | 'sl'
interface Point {
  t: number
  p: number
}
interface Drawing {
  id: string
  kind: 'trend' | 'hline' | 'tp' | 'sl'
  a: Point
  b?: Point
}

/** A live order's or trigger's price, drawn as a dashed line (not a drawing: it follows the account). */
export interface ChartLevel {
  key: string
  price: number
  label: string
  tone: 'bid' | 'ask' | 'muted'
}

export interface ChartPosition {
  /** Signed: positive long, negative short. */
  size: number
  entry: number
  liquidation: number | null
}

interface Props {
  chart: IChartApi | null
  series: ISeriesApi<SeriesType> | null
  /** Bar times, ascending (seconds), and the bar length. */
  times: number[]
  interval: number
  last: number | null
  storageKey: string
  tool: Tool
  setTool: (t: Tool) => void
  /** What the levels can do here: fill the order form's price, set an alert. Off in a converted (USD) view. */
  actions?: {
    usePrice?: (price: string) => void
    /** Put a TP/SL level in the order form's Stop tab as its trigger (a node with trigger orders). */
    useTrigger?: (price: string) => void
    /** Place it as the open position's TP/SL; resolves to what to tell the user. */
    placeTrigger?: (kind: 'tp' | 'sl', price: string) => Promise<string>
    alert?: { path: string; label: string; slot: string }
  }
  position?: ChartPosition | null
  /** The account's open orders and triggers on this market. */
  levels?: ChartLevel[]
  unit: string
  /** Bumped by the toolbar's "remove all". */
  clearToken: number
  onCount: (n: number) => void
}

const COLORS = { trend: 'hsl(var(--primary))', hline: 'hsl(var(--muted-foreground))', tp: 'hsl(var(--bid))', sl: 'hsl(var(--ask))' }

function load(key: string): Drawing[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((d): d is Drawing => !!d && typeof d.id === 'string' && ['trend', 'hline', 'tp', 'sl'].includes(d.kind) && Number.isFinite(d.a?.p)) : []
  } catch {
    return []
  }
}

export function ChartDrawings({ chart, series, times, interval, last, storageKey, tool, setTool, actions, position, levels, unit, clearToken, onCount }: Props) {
  const key = `qrdx-trade:drawings:${storageKey}`
  const [drawings, setDrawings] = useState<Drawing[]>(() => (typeof window === 'undefined' ? [] : load(key)))
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Drawing | null>(null)
  const [drag, setDrag] = useState<{ id: string; end: 'a' | 'b' | 'line'; from?: Point } | null>(null)
  const [, setTick] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const box = useRef<SVGSVGElement>(null)

  // A different market or unit: its own drawings.
  const [loadedKey, setLoadedKey] = useState(key)
  if (loadedKey !== key) {
    setLoadedKey(key)
    setDrawings(load(key))
    setSelected(null)
  }
  const save = useCallback(
    (next: Drawing[]) => {
      setDrawings(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* storage unavailable: this visit only */
      }
    },
    [key]
  )

  useEffect(() => onCount(drawings.length), [drawings.length, onCount])
  const cleared = useRef(clearToken)
  useEffect(() => {
    if (clearToken === cleared.current) return
    cleared.current = clearToken
    save([])
    setSelected(null)
  }, [clearToken, save])

  // Redraw when the chart scrolls, zooms or resizes.
  useEffect(() => {
    if (!chart) return
    const redraw = () => setTick((n) => n + 1)
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw)
    const ro = new ResizeObserver(redraw)
    if (box.current) ro.observe(box.current)
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw)
      ro.disconnect()
    }
  }, [chart])

  // Time ↔ the chart's logical bar index, extrapolated past either end by the bar length.
  const logicalOf = useCallback(
    (t: number): number => {
      const n = times.length
      if (!n) return 0
      if (t <= times[0]) return (t - times[0]) / interval
      if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / interval
      let lo = 0
      let hi = n - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (times[mid] <= t) lo = mid
        else hi = mid
      }
      return lo + (t - times[lo]) / (times[hi] - times[lo] || interval)
    },
    [times, interval]
  )
  const timeOf = useCallback(
    (logical: number): number => {
      const n = times.length
      if (!n) return 0
      if (logical <= 0) return times[0] + logical * interval
      if (logical >= n - 1) return times[n - 1] + (logical - (n - 1)) * interval
      const i = Math.floor(logical)
      return times[i] + (logical - i) * (times[i + 1] - times[i])
    },
    [times, interval]
  )
  const x = (t: number) => chart?.timeScale().logicalToCoordinate(logicalOf(t) as never) ?? null
  const y = (p: number) => series?.priceToCoordinate(p) ?? null
  const pointAt = (cx: number, cy: number): Point | null => {
    const logical = chart?.timeScale().coordinateToLogical(cx)
    const p = series?.coordinateToPrice(cy)
    if (logical == null || p == null) return null
    return { t: Math.round(timeOf(logical)), p: Number(p) }
  }
  const local = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const onDown = (e: React.PointerEvent) => {
    if (tool === 'cursor') return
    const pt = pointAt(...local(e))
    if (!pt) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const id = `${Date.now()}`
    if (tool === 'trend') setDraft({ id, kind: 'trend', a: pt, b: pt })
    else {
      save([...drawings, { id, kind: tool, a: pt }])
      setSelected(id)
      setTool('cursor')
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const pt = pointAt(...local(e))
    if (!pt) return
    if (draft) setDraft({ ...draft, b: pt })
    else if (drag) {
      setDrawings((list) =>
        list.map((d) => {
          if (d.id !== drag.id) return d
          if (drag.end === 'a') return { ...d, a: pt }
          if (drag.end === 'b') return { ...d, b: pt }
          // the whole line: a level moves in price; a trend line by the pointer's delta
          if (!d.b) return { ...d, a: { ...d.a, p: pt.p } }
          const from = drag.from ?? pt
          const dt = pt.t - from.t
          const dp = pt.p - from.p
          setDrag({ ...drag, from: pt })
          return { ...d, a: { t: d.a.t + dt, p: d.a.p + dp }, b: { t: d.b.t + dt, p: d.b.p + dp } }
        })
      )
    }
  }
  const onUp = () => {
    if (draft) {
      if (draft.b && (draft.b.t !== draft.a.t || draft.b.p !== draft.a.p)) {
        save([...drawings, draft])
        setSelected(draft.id)
      }
      setDraft(null)
      setTool('cursor')
    }
    if (drag) {
      setDrag(null)
      save(drawings)
    }
  }

  const remove = useCallback(
    (id: string) => {
      save(drawings.filter((d) => d.id !== id))
      setSelected(null)
    },
    [drawings, save]
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (e.key === 'Escape') {
        setTool('cursor')
        setDraft(null)
        setSelected(null)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) remove(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, remove, setTool])

  const width = box.current?.clientWidth ?? 0
  const levelLabel = (d: Drawing) => {
    const p = d.a.p
    const parts = [`${d.kind === 'tp' ? 'TP' : d.kind === 'sl' ? 'SL' : ''} ${fmtPrice(String(p), last ?? p)}`.trim()]
    if (last) parts.push(`${p >= last ? '+' : ''}${(((p - last) / last) * 100).toFixed(2)}%`)
    if (position && (d.kind === 'tp' || d.kind === 'sl')) {
      const pnl = (p - position.entry) * position.size
      parts.push(`${pnl >= 0 ? '+' : '−'}${fmtPrice(String(Math.abs(pnl)), Math.abs(pnl) || 1)} ${unit}`)
    }
    return parts.join(' · ')
  }
  const rr = useMemo(() => {
    const tp = drawings.find((d) => d.kind === 'tp')
    const sl = drawings.find((d) => d.kind === 'sl')
    const entry = position?.entry ?? last
    if (!tp || !sl || !entry || entry === sl.a.p) return null
    return Math.abs(tp.a.p - entry) / Math.abs(entry - sl.a.p)
  }, [drawings, position, last])

  const sel = drawings.find((d) => d.id === selected) ?? null
  const shown = draft ? [...drawings, draft] : drawings
  const level = (p: number, color: string, label: string, dashed = false, key?: string) => {
    const yy = y(p)
    if (yy == null) return null
    return (
      <g key={key ?? label} pointerEvents="none">
        <line x1={0} x2={width} y1={yy} y2={yy} style={{ stroke: color }} strokeWidth={1} strokeDasharray={dashed ? '2 3' : undefined} />
        <text x={8} y={yy - 4} fontSize={10} style={{ fill: color }}>
          {label}
        </text>
      </g>
    )
  }

  return (
    <>
      <svg
        ref={box}
        className={cn('absolute inset-0 z-[5] h-full w-full', tool === 'cursor' && !drag ? 'pointer-events-none' : 'cursor-crosshair')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => drag && onUp()}
      >
        {position && level(position.entry, 'hsl(var(--foreground) / 0.6)', `Entry ${fmtPrice(String(position.entry), position.entry)} · ${position.size > 0 ? 'long' : 'short'} ${Math.abs(position.size)}`, true, 'entry')}
        {position?.liquidation && level(position.liquidation, 'hsl(var(--warn))', `Liquidation ${fmtPrice(String(position.liquidation), position.liquidation)}`, true, 'liq')}
        {levels?.map((l) => level(l.price, l.tone === 'bid' ? 'hsl(var(--bid) / 0.8)' : l.tone === 'ask' ? 'hsl(var(--ask) / 0.8)' : 'hsl(var(--muted-foreground))', l.label, true, l.key))}
        {shown.map((d) => {
          const color = COLORS[d.kind]
          const isSel = d.id === selected
          if (d.kind === 'trend' && d.b) {
            const [x1, y1, x2, y2] = [x(d.a.t), y(d.a.p), x(d.b.t), y(d.b.p)]
            if (x1 == null || y1 == null || x2 == null || y2 == null) return null
            return (
              <g key={d.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: color }} strokeWidth={isSel ? 2 : 1.5} />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={12}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => {
                    if (tool !== 'cursor') return
                    e.stopPropagation()
                    setSelected(d.id)
                    setDrag({ id: d.id, end: 'line', from: pointAt(...local(e)) ?? undefined })
                  }}
                />
                {isSel &&
                  (['a', 'b'] as const).map((end) => (
                    <circle
                      key={end}
                      cx={end === 'a' ? x1 : x2}
                      cy={end === 'a' ? y1 : y2}
                      r={5}
                      fill="hsl(var(--background))"
                      style={{ stroke: color }}
                      strokeWidth={2}
                      className="pointer-events-auto cursor-grab"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        setDrag({ id: d.id, end })
                      }}
                    />
                  ))}
              </g>
            )
          }
          const yy = y(d.a.p)
          if (yy == null) return null
          return (
            <g key={d.id}>
              <line x1={0} x2={width} y1={yy} y2={yy} style={{ stroke: color }} strokeWidth={isSel ? 2 : 1} strokeDasharray={d.kind === 'hline' ? undefined : '6 4'} />
              <line
                x1={0}
                x2={width}
                y1={yy}
                y2={yy}
                stroke="transparent"
                strokeWidth={12}
                className="pointer-events-auto cursor-ns-resize"
                onPointerDown={(e) => {
                  if (tool !== 'cursor') return
                  e.stopPropagation()
                  setSelected(d.id)
                  setDrag({ id: d.id, end: 'line' })
                }}
              />
              <text x={8} y={yy - 4} fontSize={10} style={{ fill: color }} className="num">
                {levelLabel(d)}
              </text>
            </g>
          )
        })}
      </svg>

      {sel && (
        <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-md border bg-popover px-1.5 py-1 text-[11px] shadow-lg">
          <span className="px-1 font-medium">{sel.kind === 'trend' ? 'Trend line' : sel.kind === 'hline' ? 'Level' : sel.kind === 'tp' ? 'Take profit' : 'Stop loss'}</span>
          {(sel.kind === 'tp' || sel.kind === 'sl') && actions?.placeTrigger && (
            <button
              type="button"
              disabled={placing}
              onClick={async () => {
                setPlacing(true)
                try {
                  setNote(await actions.placeTrigger!(sel.kind as 'tp' | 'sl', String(Number(sel.a.p.toPrecision(10)))))
                } catch (e) {
                  setNote((e as Error).message)
                } finally {
                  setPlacing(false)
                  setTimeout(() => setNote(null), 6000)
                }
              }}
              className="rounded px-1.5 py-0.5 font-medium hover:bg-accent disabled:opacity-50"
              title="A trigger order on the mark price that closes the whole position"
            >
              {sel.kind === 'tp' ? <Target className="mr-0.5 inline h-3 w-3" /> : <ShieldAlert className="mr-0.5 inline h-3 w-3" />}
              {placing ? 'Confirm in wallet…' : `Set as position ${sel.kind === 'tp' ? 'take profit' : 'stop loss'}`}
            </button>
          )}
          {(sel.kind === 'tp' || sel.kind === 'sl') && !actions?.placeTrigger && actions?.useTrigger && (
            <button
              type="button"
              onClick={() => actions.useTrigger!(String(Number(sel.a.p.toPrecision(10))))}
              className="rounded px-1.5 py-0.5 hover:bg-accent"
              title="Put this level in the order form's Stop tab as the trigger price"
            >
              <Crosshair className="mr-0.5 inline h-3 w-3" /> Use as stop trigger
            </button>
          )}
          {sel.kind !== 'trend' && actions?.usePrice && sel.kind !== 'sl' && !(sel.kind === 'tp' && (actions.placeTrigger || actions.useTrigger)) && (
            <button
              type="button"
              onClick={() => actions.usePrice!(String(Number(sel.a.p.toPrecision(10))))}
              className="rounded px-1.5 py-0.5 hover:bg-accent"
              title={sel.kind === 'tp' ? 'Put this price in the order form: a resting limit order at your target is a take-profit' : 'Put this price in the order form'}
            >
              <Crosshair className="mr-0.5 inline h-3 w-3" /> {sel.kind === 'tp' ? 'Place as limit order' : 'Use price'}
            </button>
          )}
          {sel.kind !== 'trend' && actions?.alert && last != null && (
            <button
              type="button"
              onClick={() => {
                const a = actions.alert!
                addAlert({ path: a.path, label: a.label, slot: a.slot, direction: sel.a.p >= last ? 'above' : 'below', price: String(Number(sel.a.p.toPrecision(10))) })
                setNote(`Alert set at ${fmtPrice(String(sel.a.p), last)}. It is a notification, not an order.`)
                setTimeout(() => setNote(null), 4000)
              }}
              className="rounded px-1.5 py-0.5 hover:bg-accent"
            >
              <Bell className="mr-0.5 inline h-3 w-3" /> Alert me
            </button>
          )}
          <button type="button" onClick={() => remove(sel.id)} className="rounded px-1.5 py-0.5 text-ask hover:bg-accent" aria-label="Delete drawing">
            <Trash2 className="inline h-3 w-3" />
          </button>
          <button type="button" onClick={() => setSelected(null)} className="rounded px-1 py-0.5 text-muted-foreground hover:bg-accent" aria-label="Deselect">
            <X className="inline h-3 w-3" />
          </button>
        </div>
      )}
      {(sel?.kind === 'sl' || sel?.kind === 'tp' || note || rr != null) && (
        <div className="pointer-events-none absolute bottom-8 left-3 z-20 max-w-[70%] space-y-0.5 rounded bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
          {rr != null && <div className="font-medium text-foreground">Reward : risk {rr.toFixed(2)}</div>}
          {sel?.kind === 'sl' && !actions?.placeTrigger && !actions?.useTrigger && <div>A stop-loss level is a marker: this network has no trigger orders yet, so it cannot close a position by itself. Set an alert on it.</div>}
          {note && <div className="text-foreground">{note}</div>}
        </div>
      )}
    </>
  )
}

/** The drawing tools, for the chart's toolbar. */
export function DrawingTools({ tool, setTool, onClear, count }: { tool: Tool; setTool: (t: Tool) => void; onClear: () => void; count: number }) {
  const tools: [Tool, typeof PenLine, string][] = [
    ['trend', PenLine, 'Trend line: press and drag'],
    ['hline', Minus, 'Horizontal level: click a price'],
    ['tp', Target, 'Take-profit level: click a price'],
    ['sl', ShieldAlert, 'Stop-loss level: click a price'],
  ]
  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Drawing tools">
      {tools.map(([t, Icon, label]) => (
        <button
          key={t}
          type="button"
          onClick={() => setTool(tool === t ? 'cursor' : t)}
          aria-pressed={tool === t}
          aria-label={label}
          title={label}
          className={cn('rounded-md p-1.5 transition-colors', tool === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
      {count > 0 && (
        <button type="button" onClick={onClear} aria-label="Remove all drawings" title="Remove all drawings" className="rounded-md p-1.5 text-muted-foreground hover:text-ask">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
