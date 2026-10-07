/**
 * The trade site's stateful services, as one Cloudflare Worker:
 *
 *  - QRDX Connect relay (docs/CONNECT.md): one Durable Object per session topic,
 *    under trade.qrdx.org/api/relay/*.
 *  - Market history (ARCHITECTURE.md §12): a cron samples every pool of each
 *    network once a minute into a SQLite Durable Object per network, served
 *    under trade.qrdx.org/api/history/*.
 *  - Public profiles (docs/PROFILES.md): names, images and links that owners of
 *    accounts and creators of tokens publish with a signature, one SQLite
 *    Durable Object per network, under trade.qrdx.org/api/profiles/*.
 *
 * Any path prefix before /v1/ is accepted, so it also works on its own hostname.
 *
 * The object keeps each side's mailbox in durable storage and delivers over
 * hibernatable WebSockets, or HTTP long-polling where sockets are not
 * available. It cannot read payloads; it records the site's browser Origin so
 * the wallet can tell the user which site it is connecting to.
 */

import { DurableObject } from 'cloudflare:workers'
import { RelayError, RelayHub, SESSION_TTL_MS, Side, isSide, isTopic, other } from './hub'
import { MarketHistory, historyFetch, sampleAll } from './history-do'
import { Profiles, profilesFetch } from './profiles-do'

export { MarketHistory, Profiles }

export interface Env {
  RELAY: DurableObjectNamespace<RelaySession>
  HISTORY: DurableObjectNamespace<MarketHistory>
  PROFILES: DurableObjectNamespace<Profiles>
  /** JSON {"mainnet": "<rpc url>", "testnet": "<rpc url>"}: the networks to record. */
  NETWORKS: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

/** `maxAge` (seconds) lets browsers and the edge cache a read; the default is no-store. */
export const json = (body: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store', ...CORS },
  })

const ROUTE = /\/v1\/([0-9a-f]{64})(?:\/(ws|messages))?\/?$/

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const url = new URL(req.url)
    if (url.pathname.includes('/history/')) return historyFetch(req, env)
    if (url.pathname.includes('/profiles/')) return profilesFetch(req, env)
    if (/\/v1\/?$/.test(url.pathname)) return json({ name: 'QRDX Connect relay', version: 1 })
    const m = ROUTE.exec(url.pathname)
    if (!m || !isTopic(m[1])) return json({ error: 'not found' }, 404)
    return env.RELAY.get(env.RELAY.idFromName(m[1])).fetch(req)
  },

  /** Every minute: record each network's pools. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sampleAll(env))
  },
}

export class RelaySession extends DurableObject<Env> {
  private hub: RelayHub
  /** Long-poll waiters per side. */
  private waiters: Record<Side, Set<() => void>> = { dapp: new Set(), wallet: new Set() }
  /** Last HTTP poll per side, for presence of clients without a socket. */
  private lastPoll: Record<Side, number> = { dapp: 0, wallet: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.hub = new RelayHub(ctx.storage)
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const [, , action] = ROUTE.exec(url.pathname) ?? []
    const side = url.searchParams.get('side')
    const origin = req.headers.get('Origin')
    try {
      if (!action) {
        if (req.method === 'GET') {
          const meta = await this.hub.meta()
          return json(meta ? { dappOrigin: meta.dappOrigin, createdAt: meta.createdAt, walletJoined: meta.walletJoined } : { dappOrigin: null, createdAt: null, walletJoined: false })
        }
        if (req.method === 'DELETE') {
          for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'session ended')
          await this.hub.wipe()
          return json({ ok: true })
        }
        return json({ error: 'method not allowed' }, 405)
      }
      if (!isSide(side)) return json({ error: 'side must be dapp or wallet' }, 400)

      if (action === 'ws') {
        if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected a WebSocket upgrade' }, 426)
        await this.touch(side, origin)
        const { 0: client, 1: server } = new WebSocketPair()
        this.ctx.acceptWebSocket(server, [side])
        for (const q of await this.hub.read(side, 0)) server.send(JSON.stringify({ type: 'message', ...q }))
        server.send(JSON.stringify({ type: 'peer', online: this.online(other(side)) }))
        this.announce(side, true)
        return new Response(null, { status: 101, webSocket: client })
      }

      // action === 'messages'
      if (req.method === 'POST') {
        await this.touch(side, origin)
        const body = (await req.json().catch(() => null)) as { payload?: unknown } | null
        const q = await this.hub.publish(side, body?.payload)
        this.deliver(other(side), q)
        return json({ seq: q.seq })
      }
      if (req.method === 'GET') {
        await this.touch(side, origin)
        this.lastPoll[side] = Date.now()
        const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0)
        const wait = Math.min(25, Math.max(0, Number(url.searchParams.get('wait') ?? 0) || 0))
        let messages = await this.hub.read(side, after)
        if (!messages.length && wait > 0) {
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(t)
              this.waiters[side].delete(done)
              resolve()
            }
            const t = setTimeout(done, wait * 1000)
            this.waiters[side].add(done)
          })
          messages = await this.hub.read(side, after)
        }
        this.lastPoll[side] = Date.now()
        return json({ messages, peer: { online: this.online(other(side)) } })
      }
      return json({ error: 'method not allowed' }, 405)
    } catch (e) {
      if (e instanceof RelayError) return json({ error: e.message }, e.status)
      return json({ error: 'relay error' }, 500)
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const side = this.ctx.getTags(ws)[0] as Side
    let msg: { type?: string; payload?: unknown; ref?: unknown; seq?: unknown }
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    } catch {
      return ws.send(JSON.stringify({ type: 'error', message: 'invalid JSON' }))
    }
    try {
      if (msg.type === 'publish') {
        await this.touch(side, null)
        const q = await this.hub.publish(side, msg.payload)
        ws.send(JSON.stringify({ type: 'published', ref: msg.ref ?? null, seq: q.seq }))
        this.deliver(other(side), q)
      } else if (msg.type === 'ack' && typeof msg.seq === 'number') {
        await this.hub.ack(side, msg.seq)
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', ref: msg.ref ?? null, message: e instanceof Error ? e.message : 'relay error' }))
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const side = this.ctx.getTags(ws)[0] as Side
    // getWebSockets still includes the closing socket.
    if (this.ctx.getWebSockets(side).filter((s) => s !== ws).length === 0) this.announce(side, false)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  async alarm(): Promise<void> {
    if (await this.hub.expired()) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'session expired')
      await this.hub.wipe()
    } else {
      await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS)
    }
  }

  private async touch(side: Side, origin: string | null) {
    await this.hub.touch(side, origin)
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS)
  }

  private deliver(to: Side, q: { seq: number; payload: string; at: number }) {
    const frame = JSON.stringify({ type: 'message', ...q })
    for (const ws of this.ctx.getWebSockets(to)) {
      try {
        ws.send(frame)
      } catch {
        /* closing socket; the message stays queued until acknowledged */
      }
    }
    for (const w of [...this.waiters[to]]) w()
  }

  private online(side: Side): boolean {
    return this.ctx.getWebSockets(side).length > 0 || Date.now() - this.lastPoll[side] < 35_000
  }

  /** Tell the other side whether `side` is reachable. */
  private announce(side: Side, online: boolean) {
    const frame = JSON.stringify({ type: 'peer', online })
    for (const ws of this.ctx.getWebSockets(other(side))) {
      try {
        ws.send(frame)
      } catch {
        /* ignore */
      }
    }
  }
}
