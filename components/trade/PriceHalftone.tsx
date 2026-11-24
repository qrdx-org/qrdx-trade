'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useApi } from '@/lib/hooks/useApi'
import type { CandleSeries, PerpMarket } from '@/lib/types'

/** CSS px between dots. */
const GRID = 7
const HOURS = 72

/** A theme token ("0 0% 98%") as `r, g, b`, for the canvas. */
function tokenRgb(name: string): string {
  const [h, s, l] = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(parseFloat)
  const sat = (s || 0) / 100
  const lig = (l || 0) / 100
  const k = (n: number) => (n + (h || 0) / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => Math.round(255 * (lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
  return `${f(0)}, ${f(8)}, ${f(4)}`
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumSignificantDigits: 6 })

/**
 * A market's last three days, printed as a halftone: a dot per grid point under the price, larger
 * near the line and smaller toward the floor, drawn in from the left. The series is the market's
 * own trades where it has them, else its reference index, and says which. Hover for the price at
 * that hour; click to open the market.
 */
export function PriceHalftone({ apiBase, market, className }: { apiBase: string; market: PerpMarket; className?: string }) {
  const { data } = useApi<CandleSeries>(`${apiBase}/perps/${market.base}/${market.quote}/candles?interval=1h&limit=${HOURS}`, 60_000)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null)
  const closes = useMemo(() => (data?.kind === 'none' ? [] : (data?.candles ?? []).map((c) => ({ t: c.t, v: Number(c.c) })).filter((c) => Number.isFinite(c.v))), [data])
  const hoverRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || closes.length < 2) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    let raf = 0
    let ink = tokenRgb('--foreground')
    const lo = Math.min(...closes.map((c) => c.v))
    const hi = Math.max(...closes.map((c) => c.v))

    const draw = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(r.width * dpr)) {
        canvas.width = Math.round(r.width * dpr)
        canvas.height = Math.round(r.height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = r.width
      const h = r.height
      ctx.clearRect(0, 0, w, h)
      const cols = Math.floor(w / GRID)
      const rows = Math.floor(h / GRID)
      const reveal = reduce ? 1 : Math.min(1, (performance.now() - t0) / 1400)
      const ease = 1 - (1 - reveal) ** 3
      const valueAt = (c: number) => {
        const f = (c / Math.max(cols - 1, 1)) * (closes.length - 1)
        const i = Math.floor(f)
        const a = closes[i].v
        const b = closes[Math.min(i + 1, closes.length - 1)].v
        return a + (b - a) * (f - i)
      }
      const hoverCol = hoverRef.current !== null ? Math.round((hoverRef.current / (closes.length - 1)) * (cols - 1)) : null
      const path = new Path2D()
      const dim = new Path2D()
      for (let c = 0; c < cols; c++) {
        if (c / cols > ease) break
        const norm = hi > lo ? (valueAt(c) - lo) / (hi - lo) : 0.5
        const top = (1 - (0.12 + 0.78 * norm)) * rows
        for (let y = Math.max(0, Math.floor(top)); y < rows; y++) {
          const depth = (y - top) / Math.max(rows - top, 1)
          const rad = (GRID / 2) * (0.86 - 0.72 * depth) * (y === Math.floor(top) ? 1.05 : 1)
          if (rad < 0.4) continue
          const x = c * GRID + GRID / 2
          const yy = y * GRID + GRID / 2
          const target = hoverCol !== null && c > hoverCol ? dim : path
          target.moveTo(x + rad, yy)
          target.arc(x, yy, rad, 0, Math.PI * 2)
        }
      }
      ctx.fillStyle = `rgba(${ink}, 0.78)`
      ctx.fill(path)
      ctx.fillStyle = `rgba(${ink}, 0.25)`
      ctx.fill(dim)
      if (hoverCol !== null) {
        ctx.fillStyle = `rgba(${ink}, 0.6)`
        const x = hoverCol * GRID + GRID / 2
        for (let y = 0; y < h; y += 4) ctx.fillRect(x, y, 1, 2)
      }
      if (reveal < 1) raf = requestAnimationFrame(draw)
    }
    draw()
    const ro = new ResizeObserver(() => draw())
    ro.observe(canvas)
    const mo = new MutationObserver(() => ((ink = tokenRgb('--foreground')), draw()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const redraw = () => draw()
    canvas.addEventListener('qrdx-hover', redraw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      canvas.removeEventListener('qrdx-hover', redraw)
    }
  }, [closes])

  if (closes.length < 2) return null
  const last = closes[closes.length - 1].v
  const first = closes[0].v
  const change = first ? ((last - first) / first) * 100 : 0
  const point = hover ? closes[hover.i] : null

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <Link href={market.path} className="font-medium hover:underline">
          {market.base}-{market.quote}
          <span className="ml-1.5 font-normal text-muted-foreground">{data?.kind === 'index' ? 'index, from public exchanges' : 'trades on QRDX'} · 3 days</span>
        </Link>
        <span className="num">
          {point ? (
            <>
              {fmt(point.v)} <span className="text-muted-foreground">{new Date(point.t * 1000).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })}</span>
            </>
          ) : (
            <>
              {fmt(last)} <span className={change >= 0 ? 'text-bid' : 'text-ask'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
            </>
          )}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="h-[120px] w-full cursor-crosshair touch-pan-y"
        aria-label={`${market.base}-${market.quote}, the last three days`}
        role="img"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (closes.length - 1))
          setHover({ x: e.clientX - r.left, i })
          hoverRef.current = i
          e.currentTarget.dispatchEvent(new Event('qrdx-hover'))
        }}
        onPointerLeave={(e) => {
          setHover(null)
          hoverRef.current = null
          e.currentTarget.dispatchEvent(new Event('qrdx-hover'))
        }}
      />
    </div>
  )
}
