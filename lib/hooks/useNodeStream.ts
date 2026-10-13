'use client'

/**
 * The QRDX node's realtime stream (qrdx-node qrdx/exchange/stream.py), as a refresh signal.
 *
 * A block comes every 250 ms. Polling the API on a timer either lags the chain or asks
 * far more often than anything changes; the node instead pushes an event on a channel
 * when a block changes what it covers: `spot_book:<a>:<b>`, `orderbook:<market>`,
 * `trades:<market>`, `spot_account:<address>`, `perp_book:<id>`, `perp_account:<address>`,
 * `perp_markets:<id>`, `spot_pools:<id>`, and `blocks` for every block.
 *
 * The views keep reading the API (which owns pair orientation, slugs and USD values) and
 * re-read it when their channels fire, at most every `minIntervalMs`. One WebSocket per
 * network serves the whole page; channels are reference-counted; it reconnects with
 * backoff. While it is down, the views' own polling carries on (`useStreamLive`).
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

type Listener = () => void

interface Frame {
  type?: string
  channel?: string
  key?: string | null
  height?: number
}

/** Market keys name a pair in either order ("a:b" = "b:a"); token addresses are lower-case. */
function normalKey(key: string): string {
  const parts = key.split(':').map((p) => (/^0x/i.test(p) && !/^0xPQ/i.test(p) ? p.toLowerCase() : p.toUpperCase() === 'QRDX' ? 'QRDX' : p))
  return parts.length === 2 ? [...parts].sort().join(':') : parts.join(':')
}

function matches(subscription: string, frame: Frame): boolean {
  const [base, ...rest] = subscription.split(':')
  if (frame.channel !== base) return false
  if (!rest.length) return true
  if (frame.key == null) return false
  const want = normalKey(rest.join(':'))
  return String(frame.key)
    .split(',')
    .some((k) => normalKey(k) === want || normalKey(k).toLowerCase() === want.toLowerCase())
}

class NodeStream {
  private ws: WebSocket | null = null
  private readonly counts = new Map<string, number>()
  private readonly listeners = new Map<Listener, string[]>()
  private readonly liveListeners = new Set<Listener>()
  private retry: ReturnType<typeof setTimeout> | null = null
  private failures = 0
  live = false
  height: number | null = null

  constructor(private readonly url: string) {}

  subscribe(channels: string[], listener: Listener): () => void {
    this.listeners.set(listener, channels)
    const added: string[] = []
    for (const c of channels) {
      const n = this.counts.get(c) ?? 0
      this.counts.set(c, n + 1)
      if (n === 0) added.push(c)
    }
    this.ensure()
    if (added.length) this.send({ op: 'subscribe', channels: added })
    return () => {
      this.listeners.delete(listener)
      const removed: string[] = []
      for (const c of channels) {
        const n = (this.counts.get(c) ?? 1) - 1
        if (n <= 0) {
          this.counts.delete(c)
          removed.push(c)
        } else this.counts.set(c, n)
      }
      if (removed.length) this.send({ op: 'unsubscribe', channels: removed })
      if (!this.counts.size) this.close()
    }
  }

  onLive(listener: Listener): () => void {
    this.liveListeners.add(listener)
    return () => this.liveListeners.delete(listener)
  }

  private setLive(live: boolean) {
    if (this.live === live) return
    this.live = live
    for (const l of this.liveListeners) l()
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private ensure() {
    if (this.ws || this.retry || typeof WebSocket === 'undefined') return
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      return this.scheduleRetry()
    }
    this.ws = ws
    ws.onopen = () => {
      // The node starts every connection on "blocks"; replace that with what the page wants.
      ws.send(JSON.stringify({ op: 'set', channels: [...this.counts.keys()] }))
    }
    ws.onmessage = (msg) => {
      let frame: Frame
      try {
        frame = JSON.parse(String(msg.data)) as Frame
      } catch {
        return
      }
      if (frame.type === 'hello') {
        this.failures = 0
        this.setLive(true)
        return
      }
      if (frame.type === 'ping' || frame.type === 'error' || !frame.channel) return
      if (frame.channel === 'blocks' && typeof frame.height === 'number') this.height = frame.height
      for (const [listener, channels] of this.listeners) if (channels.some((c) => matches(c, frame))) listener()
    }
    ws.onclose = () => {
      this.ws = null
      this.setLive(false)
      if (this.counts.size) this.scheduleRetry()
    }
    ws.onerror = () => {
      // onclose follows
    }
  }

  private scheduleRetry() {
    if (this.retry) return
    this.failures++
    this.retry = setTimeout(() => {
      this.retry = null
      this.ensure()
    }, Math.min(30_000, 1000 * 2 ** Math.min(5, this.failures)))
  }

  private close() {
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.setLive(false)
  }
}

const streams = new Map<string, NodeStream>()

function streamFor(nodeUrl: string): NodeStream {
  const url = `${nodeUrl.replace(/\/+$/, '').replace(/^http/i, 'ws')}/ws`
  let s = streams.get(url)
  if (!s) streams.set(url, (s = new NodeStream(url)))
  return s
}

/**
 * Call `onChange` when any of `channels` fires (falsy entries are skipped), at most once every
 * `minIntervalMs`; a burst inside that window still ends with one call after it.
 */
export function useNodeStream(nodeUrl: string | null, channels: (string | null | undefined | false)[], onChange: () => void, minIntervalMs = 500) {
  const cb = useRef(onChange)
  cb.current = onChange
  const key = channels.filter(Boolean).join('|')
  useEffect(() => {
    if (!nodeUrl || !key) return
    let last = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      const now = Date.now()
      if (now - last >= minIntervalMs) {
        last = now
        cb.current()
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null
          last = Date.now()
          cb.current()
        }, minIntervalMs - (now - last))
      }
    }
    const off = streamFor(nodeUrl).subscribe(key.split('|'), fire)
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [nodeUrl, key, minIntervalMs])
}

/** Whether the node's stream is connected (views poll slower while it is). */
export function useStreamLive(nodeUrl: string | null): boolean {
  const s = nodeUrl ? streamFor(nodeUrl) : null
  const subscribe = useCallback((l: Listener) => (s ? s.onLive(l) : () => undefined), [s])
  return useSyncExternalStore(subscribe, () => !!s?.live, () => false)
}

/** The chain's height as the stream announces blocks (null until one arrives or without a stream). */
export function useStreamHeight(nodeUrl: string | null): number | null {
  const s = nodeUrl ? streamFor(nodeUrl) : null
  const subscribe = useCallback((l: Listener) => (s ? s.subscribe(['blocks'], l) : () => undefined), [s])
  return useSyncExternalStore(subscribe, () => s?.height ?? null, () => null)
}
