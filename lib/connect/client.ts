/**
 * QRDX Connect relay client (docs/CONNECT.md), for either side. Kept identical
 * in qrdx-trade and qrdx-wallet.
 *
 * Receives over a WebSocket, falling back to HTTP long-polling when sockets
 * fail; sends over the socket when open, else HTTP. Every message is sealed
 * with the pairing key, and acknowledged to the relay only after the handler
 * has run, so a page that closes mid-message gets it again on reconnect.
 */

import { Side, open, seal, topicOf } from './crypto'

export type Status = 'connecting' | 'online' | 'offline' | 'closed'

export interface RelayClientOptions {
  relay: string
  key: Uint8Array
  side: Side
  onMessage: (message: unknown) => void | Promise<void>
  onStatus?: (status: Status) => void
  /** Whether the other side is reachable right now. */
  onPeer?: (online: boolean) => void
}

const peerOf = (s: Side): Side => (s === 'dapp' ? 'wallet' : 'dapp')

export class RelayClient {
  private topic = ''
  private ws: WebSocket | null = null
  private lastSeq = 0
  private closed = false
  private wsFailures = 0
  private polling = false
  private retry: ReturnType<typeof setTimeout> | null = null
  private status: Status = 'connecting'

  constructor(private readonly o: RelayClientOptions) {}

  async start(): Promise<void> {
    this.topic = await topicOf(this.o.key)
    this.connect()
  }

  getTopic(): string {
    return this.topic
  }

  private base() {
    return `${this.o.relay}/v1/${this.topic}`
  }

  private setStatus(s: Status) {
    if (s === this.status) return
    this.status = s
    this.o.onStatus?.(s)
  }

  private connect() {
    if (this.closed) return
    if (this.wsFailures >= 3 || typeof WebSocket === 'undefined') return void this.poll()
    this.setStatus('connecting')
    const ws = new WebSocket(`${this.base().replace(/^http/, 'ws')}/ws?side=${this.o.side}`)
    let opened = false
    ws.onopen = () => {
      opened = true
      this.wsFailures = 0
      this.setStatus('online')
    }
    ws.onmessage = (e) => void this.frame(String(e.data))
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null
      if (this.closed) return
      if (!opened) this.wsFailures++
      this.setStatus('offline')
      this.retry = setTimeout(() => this.connect(), Math.min(15_000, 1000 * 2 ** Math.min(4, this.wsFailures)))
    }
    this.ws = ws
  }

  private async frame(raw: string) {
    let f: { type?: string; seq?: number; payload?: string; online?: boolean }
    try {
      f = JSON.parse(raw)
    } catch {
      return
    }
    if (f.type === 'peer') this.o.onPeer?.(!!f.online)
    if (f.type === 'message' && typeof f.seq === 'number' && typeof f.payload === 'string') {
      await this.deliver(f.seq, f.payload)
      this.ws?.send(JSON.stringify({ type: 'ack', seq: f.seq }))
    }
  }

  private async deliver(seq: number, payload: string) {
    if (seq <= this.lastSeq) return
    this.lastSeq = seq
    let message: unknown
    try {
      message = await open(this.o.key, this.topic, peerOf(this.o.side), payload)
    } catch {
      return // not sealed by the other side of this session: drop it
    }
    try {
      await this.o.onMessage(message)
    } catch (e) {
      console.warn('[qrdx-connect] handler failed', e)
    }
  }

  private async poll() {
    if (this.polling) return
    this.polling = true
    while (!this.closed) {
      try {
        const res = await fetch(`${this.base()}/messages?side=${this.o.side}&after=${this.lastSeq}&wait=25`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`relay HTTP ${res.status}`)
        const body = (await res.json()) as { messages: { seq: number; payload: string }[]; peer: { online: boolean } }
        this.setStatus('online')
        this.o.onPeer?.(body.peer.online)
        for (const m of body.messages) await this.deliver(m.seq, m.payload)
      } catch {
        this.setStatus('offline')
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    this.polling = false
  }

  /** Seal and send a message to the other side. Resolves once the relay has queued it. */
  async send(message: unknown): Promise<void> {
    if (!this.topic) this.topic = await topicOf(this.o.key)
    const payload = await seal(this.o.key, this.topic, this.o.side, message)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'publish', payload }))
      return
    }
    const res = await fetch(`${this.base()}/messages?side=${this.o.side}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload }),
    })
    if (!res.ok) throw new Error(`The relay refused the message (HTTP ${res.status}).`)
  }

  /** Nudge a reconnect now (e.g. when the page becomes visible again). */
  wake() {
    if (this.closed || this.ws || this.polling) return
    if (this.retry) clearTimeout(this.retry)
    this.connect()
  }

  close() {
    this.closed = true
    if (this.retry) clearTimeout(this.retry)
    this.ws?.close()
    this.ws = null
    this.setStatus('closed')
  }

  /** End the session at the relay as well (deletes its queued messages). */
  async destroy() {
    this.close()
    if (this.topic) await fetch(this.base(), { method: 'DELETE' }).catch(() => undefined)
  }
}
