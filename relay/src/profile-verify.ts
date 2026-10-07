/**
 * Proof that a profile claim was signed by its signer (docs/PROFILES.md).
 *
 *   0xPQ… signer  ML-DSA-65 over "\x19QRDX PQ Signed Message:\n" + byteLength + message
 *                 (the wallet's qrdx_signPQMessage). The public key travels with the
 *                 claim; its address is "0xPQ" + the first 32 bytes of keccak256(key).
 *   0x… signer    secp256k1 over EIP-191 (the wallet's personal_sign); the address is
 *                 recovered from the 65-byte r ‖ s ‖ v signature.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { EVM_ADDRESS, PQ_ADDRESS, ProfileError, addressKey } from './profile-claim'

const ML_DSA_65 = { publicKey: 1952, signature: 3309 }

function hexBytes(hex: unknown, field: string, length?: number): Uint8Array {
  if (typeof hex !== 'string' || !/^(0x)?([0-9a-fA-F]{2})+$/.test(hex)) throw new ProfileError(`${field} must be hex`)
  const clean = hex.replace(/^0x/, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  if (length !== undefined && out.length !== length) throw new ProfileError(`${field} must be ${length} bytes`)
  return out
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const utf8 = (s: string) => new TextEncoder().encode(s)

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** The bytes qrdx_signPQMessage signs (qrdx-wallet src/core/pq.ts pqPrefixedMessage). */
export function pqPrefixed(message: string): Uint8Array {
  const body = utf8(message)
  return concat(utf8(`\x19QRDX PQ Signed Message:\n${body.length}`), body)
}

/** The hash personal_sign signs (EIP-191). */
export function eip191Hash(message: string): Uint8Array {
  const body = utf8(message)
  return keccak_256(concat(utf8(`\x19Ethereum Signed Message:\n${body.length}`), body))
}

/** 0xPQ address of an ML-DSA-65 public key, lower-case. */
export function pqAddressOf(publicKey: Uint8Array): string {
  return `0xpq${toHex(keccak_256(publicKey).slice(0, 32))}`
}

/** 0x address of an uncompressed secp256k1 public key (65 bytes), lower-case. */
export function evmAddressOf(publicKey: Uint8Array): string {
  return `0x${toHex(keccak_256(publicKey.slice(1)).slice(-20))}`
}

/** Throws ProfileError(401) unless `signature` over `message` is by `signer`. */
export function verifySigner(signer: string, message: string, signature: unknown, publicKey: unknown): void {
  if (PQ_ADDRESS.test(signer)) {
    const key = hexBytes(publicKey, 'publicKey', ML_DSA_65.publicKey)
    const sig = hexBytes(signature, 'signature', ML_DSA_65.signature)
    if (pqAddressOf(key) !== addressKey(signer)) throw new ProfileError('the public key is not the signer’s', 401)
    let ok = false
    try {
      ok = ml_dsa65.verify(sig, pqPrefixed(message), key)
    } catch {
      ok = false
    }
    if (!ok) throw new ProfileError('the signature does not verify', 401)
    return
  }
  if (EVM_ADDRESS.test(signer)) {
    const sig = hexBytes(signature, 'signature', 65)
    const v = sig[64]
    const recovery = v >= 27 ? v - 27 : v
    if (recovery !== 0 && recovery !== 1) throw new ProfileError('signature has a bad recovery byte', 401)
    // noble's "recovered" format puts the recovery byte first.
    const recovered = new Uint8Array(65)
    recovered[0] = recovery
    recovered.set(sig.slice(0, 64), 1)
    let address: string
    try {
      const pub = secp256k1.recoverPublicKey(recovered, eip191Hash(message), { prehash: false })
      address = evmAddressOf(secp256k1.Point.fromBytes(pub).toBytes(false))
    } catch {
      throw new ProfileError('the signature does not verify', 401)
    }
    if (address !== addressKey(signer)) throw new ProfileError('the signature is not the signer’s', 401)
    return
  }
  throw new ProfileError('signer is not an address')
}
