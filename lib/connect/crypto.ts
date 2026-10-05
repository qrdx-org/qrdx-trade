/**
 * QRDX Connect encryption (docs/CONNECT.md). Kept byte-identical in qrdx-trade
 * (lib/connect) and qrdx-wallet (src/core/connect); both test the same vector.
 *
 *   topic   = hex(sha256(key))
 *   payload = base64url(iv[12] ‖ AES-256-GCM(key, iv, aad, utf8(json)))
 *   aad     = "qrdx-connect:v1:<topic>:<sender side>"
 */

export type Side = 'dapp' | 'wallet'

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

export function randomKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

export async function topicOf(key: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', key as BufferSource)))
}

const aad = (topic: string, from: Side) => new TextEncoder().encode(`qrdx-connect:v1:${topic}:${from}`)

async function aesKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.length !== 32) throw new Error('QRDX Connect keys are 32 bytes')
  return crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(key: Uint8Array, topic: string, from: Side, message: unknown, iv?: Uint8Array): Promise<string> {
  const nonce = iv ?? crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad(topic, from) as BufferSource },
      await aesKey(key),
      new TextEncoder().encode(JSON.stringify(message))
    )
  )
  const out = new Uint8Array(12 + ct.length)
  out.set(nonce)
  out.set(ct, 12)
  return b64url(out)
}

/** Decrypt a payload sent by `from`. Throws if it was not sealed with this key, topic and sender. */
export async function open<T = unknown>(key: Uint8Array, topic: string, from: Side, payload: string): Promise<T> {
  const raw = fromB64url(payload)
  if (raw.length < 12 + 16) throw new Error('payload too short')
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, 12) as BufferSource, additionalData: aad(topic, from) as BufferSource },
    await aesKey(key),
    raw.slice(12) as BufferSource
  )
  return JSON.parse(new TextDecoder().decode(pt)) as T
}
