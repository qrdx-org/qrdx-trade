/**
 * Display formatting. Inputs are decimal strings from the API; the output is
 * text only, so rounding here never reaches a signed transaction.
 */

import { round } from './decimal'

/** Decimal places that show a price meaningfully at its magnitude. */
export function priceDecimals(reference: number): number {
  const a = Math.abs(reference)
  if (!Number.isFinite(a) || a === 0) return 2
  if (a >= 10_000) return 1
  if (a >= 100) return 2
  if (a >= 1) return 4
  // Below 1: five significant digits.
  return Math.min(18, Math.max(4, -Math.floor(Math.log10(a)) + 4))
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Format a decimal string to fixed places with thousands separators (exact, no float). */
export function fixed(value: string | null | undefined, places: number): string {
  if (value === null || value === undefined || value === '') return '—'
  let r: string
  try {
    r = round(value, places)
  } catch {
    return value
  }
  const neg = r.startsWith('-')
  const [w, f = ''] = (neg ? r.slice(1) : r).split('.')
  const frac = places > 0 ? '.' + f.padEnd(places, '0') : ''
  return `${neg ? '-' : ''}${group(w)}${frac}`
}

export function price(value: string | null | undefined, reference?: number): string {
  if (value === null || value === undefined) return '—'
  return fixed(value, priceDecimals(reference ?? Number(value)))
}

export function size(value: string | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return '—'
  const n = Math.abs(Number(value))
  // Large sizes need fewer places; tiny ones need more.
  const places = n >= 100_000 ? 0 : n >= 1_000 ? 2 : n > 0 && n < 0.001 ? Math.min(8, decimals + 4) : decimals
  return fixed(value, places)
}

export function compact(value: string | number | null | undefined, prefix = ''): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e18) return `${n < 0 ? '-' : ''}${prefix}${a.toExponential(2)}`
  const [d, s] = a >= 1e15 ? [1e15, 'Q'] : a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, '']
  return `${n < 0 ? '-' : ''}${prefix}${(a / d).toFixed(a >= 1e3 ? 2 : a >= 1 ? 2 : 4)}${s}`
}

export function percent(value: string | null | undefined, signed = true): string {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function usd(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const n = Number(value)
  return `$${fixed(value, n >= 1 ? 2 : priceDecimals(n))}`
}

export function timeAgo(sec: number, now = Date.now() / 1000): string {
  const d = Math.max(0, Math.round(now - sec))
  if (d < 60) return `${d}s ago`
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86_400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86_400)}d ago`
}

export function clock(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function countdown(toSec: number | null, now = Date.now() / 1000): string {
  if (!toSec) return '—'
  const d = Math.max(0, Math.round(toSec - now))
  const h = Math.floor(d / 3600)
  const m = Math.floor((d % 3600) / 60)
  const s = d % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const tone = (v: string | null | undefined) =>
  v === null || v === undefined || Number(v) === 0 ? 'text-muted-foreground' : Number(v) > 0 ? 'text-bid' : 'text-ask'
