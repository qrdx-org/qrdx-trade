/**
 * Exchange transactions signed in the browser by a one-click trading key (an agent the
 * wallet approved: qrdx-node docs/TRADING_FEATURES.md §8). The same bytes the wallet signs
 * (qrdx-wallet src/core/exchange-tx.ts; tests/unit/exchange-sign.test.ts checks them against
 * vectors the node produced):
 *
 *   "QRDX-EXCHANGE-TX-v1\0" · chain_id (u64 BE) · op_type (u8) · sender · nonce (u64 BE)
 *   · json.dumps(params, sort_keys=True) · gas_limit (u64 BE) · gas_price (decimal)
 *   · "\0signer:" + signer (only when one signs for another account)
 *
 * signed with ML-DSA-65; the hash is BLAKE2b-256 of the same bytes.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/** Operation numbers of what this site signs itself (qrdx-node ExchangeOpType). */
export const OP_CODES: Record<string, number> = {
  SWAP: 4,
  PLACE_ORDER: 5,
  CANCEL_ORDER: 6,
  PERP_SET_LEVERAGE: 20,
  PERP_ORDER: 21,
  PERP_CANCEL: 22,
  PERP_TRIGGER: 56,
  CANCEL_ALL: 57,
  PERP_MODIFY: 58,
  MODIFY_ORDER: 59,
  BATCH: 60,
  TWAP_ORDER: 61,
  TWAP_CANCEL: 62,
  AGENT_REVOKE: 64,
  PERP_ISOLATED_MARGIN: 76,
  SCHEDULE_CANCEL: 77,
}

/** What an agent key may sign (qrdx-node AGENT_SCOPE): trading, never moving funds out. */
export const AGENT_SCOPE = new Set([
  'PLACE_ORDER',
  'CANCEL_ORDER',
  'MODIFY_ORDER',
  'SWAP',
  'PERP_SET_LEVERAGE',
  'PERP_ORDER',
  'PERP_CANCEL',
  'PERP_TRIGGER',
  'PERP_MODIFY',
  'CANCEL_ALL',
  'TWAP_ORDER',
  'TWAP_CANCEL',
  'PERP_ISOLATED_MARGIN',
  'SCHEDULE_CANCEL',
])

export interface UnsignedTx {
  op_type: number
  chain_id: number
  sender: string
  signer?: string
  nonce: number
  params: Record<string, unknown>
  gas_limit: number
  gas_price: string
}

function pyString(s: string): string {
  let out = '"'
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const ch = s[i]
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\b') out += '\\b'
    else if (ch === '\f') out += '\\f'
    else if (c < 0x20 || c > 0x7e) out += c === 0x7f ? ch : '\\u' + c.toString(16).padStart(4, '0')
    else out += ch
  }
  return out + '"'
}

/** Python's json.dumps(value, sort_keys=True): ", " / ": " separators, ASCII only, integers only. */
export function pythonJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`Pass ${value} as a decimal string`)
    return String(value)
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return pyString(value)
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value as object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${keys.map((k) => `${pyString(k)}: ${pythonJson((value as Record<string, unknown>)[k])}`).join(', ')}}`
  }
  throw new Error(`Cannot serialise ${typeof value}`)
}

const utf8 = new TextEncoder()
const u64 = (n: number) => {
  const out = new Uint8Array(8)
  let v = BigInt(n)
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

export function signingBytes(tx: UnsignedTx): Uint8Array {
  const parts = [
    utf8.encode('QRDX-EXCHANGE-TX-v1\0'),
    u64(tx.chain_id),
    new Uint8Array([tx.op_type]),
    utf8.encode(tx.sender),
    u64(tx.nonce),
    utf8.encode(pythonJson(tx.params)),
    u64(tx.gas_limit),
    utf8.encode(BigInt(tx.gas_price).toString()),
    ...(tx.signer ? [utf8.encode('\0signer:' + tx.signer)] : []),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export const txHash = (tx: UnsignedTx) => bytesToHex(blake2b(signingBytes(tx), { dkLen: 32 }))

/** A 0xPQ address: the first 32 bytes of keccak256(public key), checksummed by case. */
export function pqAddress(publicKey: Uint8Array): string {
  const body = bytesToHex(keccak_256(publicKey)).slice(0, 64)
  const hash = bytesToHex(keccak_256(utf8.encode(body)))
  let out = '0xPQ'
  for (let i = 0; i < 64; i++) {
    const c = body[i]
    out += /[0-9]/.test(c) ? c : parseInt(hash[i % hash.length], 16) >= 8 ? c.toUpperCase() : c
  }
  return out
}

export interface PqKey {
  seed: string
  publicKey: Uint8Array
  secretKey: Uint8Array
  address: string
}

export function keyFromSeed(seedHex: string): PqKey {
  const seed = Uint8Array.from(seedHex.match(/../g)!.map((b) => parseInt(b, 16)))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  return { seed: seedHex, publicKey, secretKey, address: pqAddress(publicKey) }
}

export function newKey(): PqKey {
  const seed = new Uint8Array(32)
  crypto.getRandomValues(seed)
  return keyFromSeed(bytesToHex(seed))
}

/** The transaction as exchange_sendTransaction takes it. */
export function signTx(tx: UnsignedTx, key: PqKey) {
  return {
    ...tx,
    public_key: bytesToHex(key.publicKey),
    signature: bytesToHex(ml_dsa65.sign(signingBytes(tx), key.secretKey)),
  }
}
