/**
 * QRDX Connect (docs/CONNECT.md): the encryption both apps must agree on, the
 * pairing format, and the relay's mailbox rules.
 *
 * The vector below is also in qrdx-wallet/tests/unit/connect.test.ts, and was
 * checked independently with Python's AES-GCM. Change both or neither.
 */
import { describe, expect, it } from 'vitest'
import { open, seal, topicOf } from '@/lib/connect/crypto'
import { formatPairing, parsePairing, walletLink } from '@/lib/connect/pairing'
import { MAX_QUEUE, MESSAGE_TTL_MS, RelayHub, Store } from '@/relay/src/hub'

const KEY = Uint8Array.from({ length: 32 }, (_, i) => i)
const IV = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i)
const TOPIC = '630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd'
const MESSAGE = { t: 'req', id: '1', method: 'qrdx_accounts', params: [] }
const PAYLOAD =
  'oKGio6SlpqeoqaqrnToID3_pcNoTR6vxbh7i5FKdezyw2icY9GFCpEWJBHO2DhiezEE8SDHod-olWPOYNXorO0DqQSM8Et9R4DCX5-CYKxYXqw3hTQ'

describe('encryption', () => {
  it('matches the shared vector', async () => {
    expect(await topicOf(KEY)).toBe(TOPIC)
    expect(await seal(KEY, TOPIC, 'dapp', MESSAGE, IV)).toBe(PAYLOAD)
    expect(await open(KEY, TOPIC, 'dapp', PAYLOAD)).toEqual(MESSAGE)
  })

  it('refuses a message reflected back to its sender, moved to another session, or altered', async () => {
    await expect(open(KEY, TOPIC, 'wallet', PAYLOAD)).rejects.toThrow()
    await expect(open(KEY, 'ff'.repeat(32), 'dapp', PAYLOAD)).rejects.toThrow()
    const altered = PAYLOAD.slice(0, 40) + (PAYLOAD[40] === 'A' ? 'B' : 'A') + PAYLOAD.slice(41)
    await expect(open(KEY, TOPIC, 'dapp', altered)).rejects.toThrow()
    const otherKey = Uint8Array.from({ length: 32 }, () => 7)
    await expect(open(otherKey, TOPIC, 'dapp', PAYLOAD)).rejects.toThrow()
  })

  it('uses a fresh IV per message', async () => {
    const a = await seal(KEY, TOPIC, 'wallet', { t: 'bye' })
    const b = await seal(KEY, TOPIC, 'wallet', { t: 'bye' })
    expect(a).not.toBe(b)
  })
})

describe('pairing', () => {
  const p = { key: KEY, relay: 'https://trade.qrdx.org/api/relay', name: 'QRDX Trade', url: 'https://trade.qrdx.org' }

  it('round-trips through a wallet link', () => {
    const link = walletLink('https://wallet.qrdx.org/', formatPairing(p))
    expect(link.startsWith('https://wallet.qrdx.org/wallet?connect=qrdx-connect%3Av1%3F')).toBe(true)
    const back = parsePairing(link)
    expect(back.key).toEqual(KEY)
    expect(back.relay).toBe(p.relay)
    expect(new URL(back.url).origin).toBe('https://trade.qrdx.org')
  })

  it('refuses codes that are not QRDX Connect, incomplete, or use a plain-HTTP relay', () => {
    expect(() => parsePairing('https://example.com/?x=1')).toThrow(/not a QRDX Connect/)
    expect(() => parsePairing('wc:abc@2?relay-protocol=irn')).toThrow(/not a QRDX Connect/)
    expect(() => parsePairing('qrdx-connect:v1?k=AAAA&r=https://r.example&u=https://s.example')).toThrow(/malformed key/)
    expect(() => parsePairing(formatPairing({ ...p, relay: 'http://relay.example.com' }))).toThrow(/HTTPS/)
    expect(parsePairing(formatPairing({ ...p, relay: 'http://127.0.0.1:8787/api/relay' })).relay).toBe('http://127.0.0.1:8787/api/relay')
  })
})

describe('relay hub', () => {
  const memory = (): Store => {
    const m = new Map<string, unknown>()
    return {
      get: async <T,>(k: string) => structuredClone(m.get(k)) as T | undefined,
      put: async (k, v) => void m.set(k, structuredClone(v)),
      delete: async (k) => m.delete(k),
    }
  }

  it('records the site origin once, from the dapp side only', async () => {
    const hub = new RelayHub(memory())
    await hub.touch('wallet', 'https://evil.example')
    expect((await hub.meta())?.dappOrigin).toBeNull()
    await hub.touch('dapp', 'https://trade.qrdx.org')
    await hub.touch('dapp', 'https://evil.example')
    const m = await hub.meta()
    expect(m?.dappOrigin).toBe('https://trade.qrdx.org')
    expect(m?.walletJoined).toBe(true)
  })

  it('queues for the other side until acknowledged', async () => {
    const hub = new RelayHub(memory())
    const a = await hub.publish('dapp', 'aaa')
    const b = await hub.publish('dapp', 'bbb')
    expect(await hub.read('dapp')).toEqual([])
    expect((await hub.read('wallet')).map((q) => q.payload)).toEqual(['aaa', 'bbb'])
    await hub.ack('wallet', a.seq)
    expect((await hub.read('wallet')).map((q) => q.seq)).toEqual([b.seq])
  })

  it('refuses malformed and oversized payloads, and bounds the queue', async () => {
    const hub = new RelayHub(memory())
    await expect(hub.publish('dapp', 'not base64url!')).rejects.toThrow()
    await expect(hub.publish('dapp', 'a'.repeat(64 * 1024 + 1))).rejects.toThrow(/too large/)
    for (let i = 0; i < MAX_QUEUE; i++) await hub.publish('wallet', 'x')
    await expect(hub.publish('wallet', 'x')).rejects.toThrow(/too many/)
  })

  it('drops messages older than a day', async () => {
    let now = 1_000_000
    const hub = new RelayHub(memory(), () => now)
    await hub.publish('dapp', 'old')
    now += MESSAGE_TTL_MS + 1
    expect(await hub.read('wallet')).toEqual([])
  })
})
