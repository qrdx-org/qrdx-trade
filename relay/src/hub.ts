/**
 * QRDX Connect relay: one session's mailboxes (docs/CONNECT.md).
 *
 * Pure logic over a small key-value store and a clock, so the Durable Object
 * and the unit tests run the same code. The relay never sees plaintext: a
 * payload is an opaque base64url string, queued for the other side until that
 * side acknowledges it.
 */

export type Side = 'dapp' | 'wallet'
export const SIDES: Side[] = ['dapp', 'wallet']
export const other = (s: Side): Side => (s === 'dapp' ? 'wallet' : 'dapp')

export const MAX_PAYLOAD = 64 * 1024
export const MAX_QUEUE = 256
export const MESSAGE_TTL_MS = 24 * 3600_000
export const SESSION_TTL_MS = 7 * 24 * 3600_000

export interface Store {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<unknown>
}

export interface Meta {
  dappOrigin: string | null
  createdAt: number
  lastSeen: number
  walletJoined: boolean
}

export interface Queued {
  seq: number
  payload: string
  at: number
}

interface Mailbox {
  next: number
  items: Queued[]
}

export class RelayError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export const isTopic = (t: string) => /^[0-9a-f]{64}$/.test(t)
export const isSide = (s: string | null): s is Side => s === 'dapp' || s === 'wallet'
const PAYLOAD_RE = /^[A-Za-z0-9_-]+$/

export class RelayHub {
  constructor(
    private readonly store: Store,
    private readonly now: () => number = () => Date.now()
  ) {}

  async meta(): Promise<Meta | undefined> {
    return this.store.get<Meta>('meta')
  }

  /**
   * Record that a side connected. The dapp side's browser Origin is recorded
   * once, the first time it is seen, and never changes: it is what the wallet
   * is told the session belongs to.
   */
  async touch(side: Side, origin: string | null): Promise<Meta> {
    const t = this.now()
    const m: Meta = (await this.meta()) ?? { dappOrigin: null, createdAt: t, lastSeen: t, walletJoined: false }
    if (side === 'dapp' && !m.dappOrigin && origin && /^https?:\/\/[^/\s]+$/.test(origin)) m.dappOrigin = origin
    if (side === 'wallet') m.walletJoined = true
    m.lastSeen = t
    await this.store.put('meta', m)
    return m
  }

  private async box(side: Side): Promise<Mailbox> {
    const b = (await this.store.get<Mailbox>(`mb:${side}`)) ?? { next: 1, items: [] }
    const cutoff = this.now() - MESSAGE_TTL_MS
    b.items = b.items.filter((i) => i.at >= cutoff)
    return b
  }

  /** Queue a payload from `from` for the other side. Returns the message and its seq. */
  async publish(from: Side, payload: unknown): Promise<Queued> {
    if (typeof payload !== 'string' || !payload || !PAYLOAD_RE.test(payload)) {
      throw new RelayError(400, 'payload must be a base64url string')
    }
    if (payload.length > MAX_PAYLOAD) throw new RelayError(413, 'payload too large')
    const to = other(from)
    const b = await this.box(to)
    if (b.items.length >= MAX_QUEUE) throw new RelayError(429, 'the other side has too many unread messages')
    const q: Queued = { seq: b.next++, payload, at: this.now() }
    b.items.push(q)
    await this.store.put(`mb:${to}`, b)
    return q
  }

  /** Messages for `side` after `after`; acknowledges (deletes) everything up to `after`. */
  async read(side: Side, after = 0): Promise<Queued[]> {
    const b = await this.box(side)
    const before = b.items.length
    b.items = b.items.filter((i) => i.seq > after)
    if (b.items.length !== before) await this.store.put(`mb:${side}`, b)
    return b.items
  }

  async ack(side: Side, seq: number): Promise<void> {
    await this.read(side, seq)
  }

  async expired(): Promise<boolean> {
    const m = await this.meta()
    return !!m && this.now() - m.lastSeen > SESSION_TTL_MS
  }

  async wipe(): Promise<void> {
    await Promise.all(['meta', 'mb:dapp', 'mb:wallet'].map((k) => this.store.delete(k)))
  }
}
