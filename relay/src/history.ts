/**
 * Market history from sampled pool state (docs/ARCHITECTURE.md §12).
 *
 * Public QRDX nodes do not serve trade history: spot fills are not journaled,
 * and block reads are cost-limited per IP. So the worker samples every pool
 * once a minute (price, and the pool's cumulative amount paid in per token) and stores
 * a row whenever something changed. A pool's state only changes at a block, so
 * this records each block's closing price exactly, and volumes exactly from the
 * counters; what it cannot see is the path of prices inside one block.
 *
 * Pure functions over samples; the Durable Object stores and queries them.
 */

import { Dec, dec, div, mul, str } from '../../lib/decimal'

export interface Sample {
  /** Unix seconds, on the minute. */
  t: number
  /** token1 per token0. */
  price: string
  /** Cumulative amount swapped in, token0 and token1 (the node's pool `volume`). */
  v0: string
  v1: string
}

export interface HistoryCandle {
  t: number
  o: string
  h: string
  l: string
  c: string
  /** Volume traded in the bucket, both directions, in token0 and in token1 units. */
  v0: string
  v1: string
}

/** Should a new sample be stored, given the last stored one? */
export function changed(last: Sample | undefined, next: Sample, heartbeatSec = 3600): boolean {
  if (!last) return true
  return last.price !== next.price || last.v0 !== next.v0 || last.v1 !== next.v1 || next.t - last.t >= heartbeatSec
}

const delta = (a: string, b: string): Dec => {
  const d = dec(a) - dec(b)
  return d > 0n ? d : 0n
}

/**
 * Volume traded between two samples, in token0 and in token1 units. The node
 * counts only what is paid in (token0 in for a sell of token0, token1 in for a
 * buy), so the other side of each direction is valued at the mean of the pool
 * price before and after.
 */
export function traded(prev: Sample, next: Sample): { v0: Dec; v1: Dec } {
  const in0 = delta(next.v0, prev.v0)
  const in1 = delta(next.v1, prev.v1)
  const mid = (dec(prev.price) + dec(next.price)) / 2n
  if (mid <= 0n) return { v0: in0, v1: in1 }
  return { v0: in0 + div(in1, mid), v1: in1 + mul(in0, mid) }
}

/** Volume over consecutive samples, starting from `from`. */
function tradedOver(from: Sample, samples: Sample[]): { v0: Dec; v1: Dec } {
  let v0 = 0n
  let v1 = 0n
  let prev = from
  for (const s of samples) {
    const v = traded(prev, s)
    v0 += v.v0
    v1 += v.v1
    prev = s
  }
  return { v0, v1 }
}

/**
 * Candles of `seconds` from samples, oldest first. `before` is the last sample at
 * or before `from` (it carries the price into the first bucket). Buckets with no
 * change repeat the previous close with zero volume, so a quiet market still
 * draws a continuous line from its first sample.
 */
export function buildCandles(samples: Sample[], before: Sample | undefined, from: number, to: number, seconds: number): HistoryCandle[] {
  const out: HistoryCandle[] = []
  const all = before ? [before, ...samples.filter((s) => s.t > before.t)] : samples
  if (!all.length) return out
  let i = 0
  let prev: Sample | undefined
  // Skip to the last sample before the first bucket.
  const start = Math.floor(Math.max(from, all[0].t) / seconds) * seconds
  while (i < all.length && all[i].t < start) prev = all[i++]
  for (let t = start; t <= to; t += seconds) {
    const end = t + seconds
    const inBucket: Sample[] = []
    while (i < all.length && all[i].t < end) inBucket.push(all[i++])
    const open = prev ?? inBucket[0]
    if (!open) continue
    const last = inBucket.length ? inBucket[inBucket.length - 1] : open
    const vol = prev ? tradedOver(prev, inBucket) : tradedOver(inBucket[0], inBucket.slice(1))
    let h = open.price
    let l = open.price
    for (const s of inBucket) {
      if (dec(s.price) > dec(h)) h = s.price
      if (dec(s.price) < dec(l)) l = s.price
    }
    out.push({
      t,
      o: open.price,
      h,
      l,
      c: last.price,
      v0: str(vol.v0),
      v1: str(vol.v1),
    })
    prev = last
  }
  return out
}

export interface HistoryStats {
  /** Latest stored price. */
  last: string | null
  /** Price at or before 24 h ago, else the earliest stored (when younger than a day). */
  open24h: string | null
  /** Volume traded over the last 24 h, in token0 and in token1 units. */
  v0_24h: string
  v1_24h: string
  firstAt: number | null
}

/** 24 h stats from the sample at or before `since` (if any) and the samples after it. */
export function stats24h(before: Sample | undefined, after: Sample[], first: Sample | undefined): HistoryStats {
  const latest = after.length ? after[after.length - 1] : before
  const base = before ?? after[0]
  const vol = base ? tradedOver(base, before ? after : after.slice(1)) : { v0: 0n, v1: 0n }
  return {
    last: latest?.price ?? null,
    open24h: base?.price ?? null,
    v0_24h: str(vol.v0),
    v1_24h: str(vol.v1),
    firstAt: first?.t ?? null,
  }
}
