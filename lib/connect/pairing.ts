/**
 * QRDX Connect pairing URIs and wallet links (docs/CONNECT.md). Kept identical
 * in qrdx-trade and qrdx-wallet.
 *
 *   qrdx-connect:v1?k=<base64url key>&r=<relay base URL>&n=<site name>&u=<site URL>
 *   <wallet URL>/wallet?connect=<urlencoded URI>
 */

import { b64url, fromB64url } from './crypto'

export interface Pairing {
  key: Uint8Array
  relay: string
  name: string
  url: string
}

const PREFIX = 'qrdx-connect:v1?'

export function formatPairing(p: Pairing): string {
  const q = new URLSearchParams({ k: b64url(p.key), r: p.relay, n: p.name, u: p.url })
  return PREFIX + q.toString()
}

export function walletLink(walletUrl: string, uri: string): string {
  return `${walletUrl.replace(/\/$/, '')}/wallet?connect=${encodeURIComponent(uri)}`
}

/** Accepts a pairing URI or a wallet link carrying one. Throws a readable error otherwise. */
export function parsePairing(input: string): Pairing {
  let uri = input.trim()
  if (/^https?:\/\//i.test(uri)) {
    const inner = new URL(uri).searchParams.get('connect')
    if (!inner) throw new Error('This link is not a QRDX Connect code.')
    uri = inner
  }
  if (!uri.startsWith(PREFIX)) throw new Error('This is not a QRDX Connect code.')
  const q = new URLSearchParams(uri.slice(PREFIX.length))
  const k = q.get('k')
  const relay = q.get('r')
  const url = q.get('u')
  if (!k || !relay || !url) throw new Error('This QRDX Connect code is incomplete.')
  const key = fromB64url(k)
  if (key.length !== 32) throw new Error('This QRDX Connect code has a malformed key.')
  let relayUrl: URL
  let siteUrl: URL
  try {
    relayUrl = new URL(relay)
    siteUrl = new URL(url)
  } catch {
    throw new Error('This QRDX Connect code has a malformed address.')
  }
  const local = (u: URL) => ['localhost', '127.0.0.1'].includes(u.hostname)
  if (relayUrl.protocol !== 'https:' && !local(relayUrl)) throw new Error('The relay must use HTTPS.')
  if (!/^https?:$/.test(siteUrl.protocol)) throw new Error('The site address must be a web address.')
  return { key, relay: relayUrl.toString().replace(/\/$/, ''), name: (q.get('n') ?? siteUrl.host).slice(0, 64), url: siteUrl.toString() }
}
