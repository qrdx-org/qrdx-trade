'use client'

/**
 * The QRDX Wallet on another device (a phone PWA, or the web wallet), reached
 * through QRDX Connect (docs/CONNECT.md), as an EIP-1193 provider. The rest of
 * the site uses it exactly like the extension's injected provider.
 */

import { RelayClient, Status } from '../connect/client'
import { b64url, fromB64url, randomKey } from '../connect/crypto'
import { formatPairing, walletLink } from '../connect/pairing'
import type { Eip1193Provider } from './provider'

export interface RemoteState {
  status: Status
  /** The wallet is reachable right now (its app is open). */
  peerOnline: boolean
}

interface Stored {
  k: string
  relay: string
  /** Last known answers, so a reload shows the connection before the phone replies. */
  accounts?: unknown
  chain?: unknown
}

const STORE = 'qrdx-trade:connect'
/** A request waits this long for the phone: approvals happen on the phone and it may be asleep. */
export const REQUEST_TIMEOUT_MS = 15 * 60_000

export function relayUrl(): string {
  const configured = process.env.NEXT_PUBLIC_QRDX_RELAY_URL
  if (configured) return configured.replace(/\/$/, '')
  return `${window.location.origin}/api/relay`
}

export function walletUrl(): string {
  return (process.env.NEXT_PUBLIC_QRDX_WALLET_URL || 'https://wallet.qrdx.org').replace(/\/$/, '')
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

function writeStored(s: Stored | null) {
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s))
    else localStorage.removeItem(STORE)
  } catch {
    /* the session then lasts as long as this page */
  }
}

type Listener = (...args: unknown[]) => void

export class RemoteProvider implements Eip1193Provider {
  readonly isQRDX = true
  readonly isRemote = true
  private client: RelayClient
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>()
  private listeners = new Map<string, Set<Listener>>()
  private state: RemoteState = { status: 'connecting', peerOnline: false }

  private constructor(
    private readonly key: Uint8Array,
    private readonly relay: string,
    private readonly onState?: (s: RemoteState) => void
  ) {
    this.client = new RelayClient({
      relay,
      key,
      side: 'dapp',
      onMessage: (m) => this.receive(m as Incoming),
      onStatus: (status) => this.setState({ status }),
      onPeer: (peerOnline) => this.setState({ peerOnline }),
    })
  }

  /** A new session with a fresh key. */
  static create(onState?: (s: RemoteState) => void): RemoteProvider {
    const key = randomKey()
    const relay = relayUrl()
    writeStored({ k: b64url(key), relay })
    return new RemoteProvider(key, relay, onState)
  }

  /** The session this browser had, if any. */
  static restore(onState?: (s: RemoteState) => void): RemoteProvider | null {
    const s = readStored()
    if (!s) return null
    try {
      return new RemoteProvider(fromB64url(s.k), s.relay, onState)
    } catch {
      writeStored(null)
      return null
    }
  }

  static cached(): { accounts?: unknown; chain?: unknown } {
    const s = readStored()
    return { accounts: s?.accounts, chain: s?.chain }
  }

  static remember(patch: { accounts?: unknown; chain?: unknown }) {
    const s = readStored()
    if (s) writeStored({ ...s, ...patch })
  }

  async start(): Promise<void> {
    // Connecting as the site is what lets the relay attest this page's origin to the wallet.
    await this.client.start()
    await this.client.send({ t: 'hello', dapp: { name: document.title.split('·').pop()?.trim() || 'QRDX Trade', url: window.location.origin } })
  }

  /** The pairing link the QR code shows. */
  pairingLink(): string {
    const uri = formatPairing({ key: this.key, relay: this.relay, name: 'QRDX Trade', url: window.location.origin })
    return walletLink(walletUrl(), uri)
  }

  getState(): RemoteState {
    return this.state
  }

  private setState(patch: Partial<RemoteState>) {
    this.state = { ...this.state, ...patch }
    this.onState?.(this.state)
  }

  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const id = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject({ code: 4900, message: 'No answer from the wallet. Open QRDX Wallet on your phone and try again.' })
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.client.send({ t: 'req', id, method: args.method, params: args.params ?? [] }).catch((e) => {
        clearTimeout(timer)
        this.pending.delete(id)
        reject({ code: 4900, message: e instanceof Error ? e.message : 'The relay is unreachable.' })
      })
    })
  }

  private receive(m: Incoming) {
    if (m.t === 'res' && typeof m.id === 'string') {
      const p = this.pending.get(m.id)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(m.id)
      if (m.error) p.reject(m.error)
      else p.resolve(m.result)
    } else if (m.t === 'event' && typeof m.event === 'string') {
      if (m.event === 'accountsChanged') RemoteProvider.remember({ accounts: m.data })
      this.emit(m.event, m.data)
    } else if (m.t === 'bye') {
      this.end(false)
    }
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
  }

  removeListener(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener)
  }

  private emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((l) => {
      try {
        l(...args)
      } catch {
        /* a listener's problem */
      }
    })
  }

  wake() {
    this.client.wake()
  }

  /** End the session on both sides. */
  async disconnect(): Promise<void> {
    await this.client.send({ t: 'bye' }).catch(() => undefined)
    this.end(true)
  }

  private end(destroy: boolean) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject({ code: 4900, message: 'The wallet disconnected.' })
    }
    this.pending.clear()
    writeStored(null)
    if (destroy) void this.client.destroy()
    else this.client.close()
    this.emit('disconnect')
  }
}

interface Incoming {
  t: string
  id?: string
  result?: unknown
  error?: { code: number; message: string }
  event?: string
  data?: unknown
}
