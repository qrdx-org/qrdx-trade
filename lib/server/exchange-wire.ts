/**
 * Exchange transactions in binary (qrdx-node qrdx/exchange/wire.py, chain-spec feature
 * `binary_exchange_txs`): since node 3.0.0 a block body carries each one as base64 of
 *
 *   version (1)  op_type (u8)  chain_id, nonce, gas_limit (varints)
 *   gas_price    tag 0 + varint, or tag 1 + its text
 *   timestamp    big-endian float64
 *   sender, signer, params (sorted compact JSON), signature, public_key: varint length + bytes
 *
 * The form carries no hash: it is BLAKE2b-256 of the signed bytes, recomputed here
 * (qrdx/exchange/transactions.py `_encode_canonical`).
 */

import { blake2b } from '@noble/hashes/blake2.js'

export interface WireExchangeTx {
  op_type: number
  chain_id: number
  sender: string
  signer?: string
  nonce: number
  params: Record<string, unknown>
  gas_limit: number
  gas_price: string
  timestamp: number
  tx_hash: string
  /** Sizes only: an ML-DSA signature and key are 5 KB of hex nobody reads. */
  signature_bytes: number
  public_key_bytes: number
}

const utf8 = new TextEncoder()
const text = new TextDecoder('utf-8', { fatal: true })
const TAG = utf8.encode('QRDX-EXCHANGE-TX-v1\0')

function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function u64(n: bigint): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, n)
  return out
}

/**
 * Compact JSON re-spaced as Python's `json.dumps(sort_keys=True)` prints it (", " and ": "),
 * which is the text the signature covers. Only separators outside strings change, so numbers
 * keep the node's own spelling (1.0 stays 1.0).
 */
export function pythonSpacing(compact: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < compact.length; i++) {
    const c = compact[i]
    if (inString) {
      out += c
      if (c === '\\') out += compact[++i] ?? ''
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
      out += c
    } else if (c === ',') out += ', '
    else if (c === ':') out += ': '
    else out += c
  }
  return out
}

/** Decode one transaction from its base64 text. Throws on anything malformed. */
export function decodeExchangeTx(b64: string): WireExchangeTx {
  const raw = fromBase64(b64)
  let at = 0
  const byte = () => {
    if (at >= raw.length) throw new Error('a binary transaction ends early')
    return raw[at++]
  }
  const varint = () => {
    let n = 0n
    let shift = 0n
    for (;;) {
      const b = byte()
      n |= BigInt(b & 0x7f) << shift
      if (!(b & 0x80)) return n
      shift += 7n
      if (shift > 70n) throw new Error('a varint is too long')
    }
  }
  const field = () => {
    const n = Number(varint())
    if (at + n > raw.length) throw new Error('a binary transaction ends early')
    const out = raw.subarray(at, at + n)
    at += n
    return out
  }

  const version = byte()
  if (version !== 1) throw new Error(`unknown binary transaction version ${version}`)
  const op = byte()
  const chainId = varint()
  const nonce = varint()
  const gasLimit = varint()
  const gasPrice = byte() === 0 ? varint().toString() : text.decode(field())
  if (at + 8 > raw.length) throw new Error('a binary transaction ends early')
  const timestamp = new DataView(raw.buffer, raw.byteOffset + at, 8).getFloat64(0)
  at += 8
  const sender = text.decode(field())
  const signer = text.decode(field())
  const paramsText = text.decode(field())
  const signature = field()
  const publicKey = field()

  const parts = [TAG, u64(chainId), Uint8Array.of(op), utf8.encode(sender), u64(nonce), utf8.encode(pythonSpacing(paramsText)), u64(gasLimit), utf8.encode(gasPrice)]
  if (signer) parts.push(utf8.encode(`\0signer:${signer}`))
  const signed = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    signed.set(p, o)
    o += p.length
  }
  const hash = blake2b(signed, { dkLen: 32 })

  return {
    op_type: op,
    chain_id: Number(chainId),
    sender,
    ...(signer ? { signer } : {}),
    nonce: Number(nonce),
    params: JSON.parse(paramsText) as Record<string, unknown>,
    gas_limit: Number(gasLimit),
    gas_price: gasPrice,
    timestamp,
    tx_hash: Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join(''),
    signature_bytes: signature.length,
    public_key_bytes: publicKey.length,
  }
}
