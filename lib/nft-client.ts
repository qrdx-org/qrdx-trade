'use client'

/**
 * The browser's side of the NFT market: a dry run of each contract call before the wallet signs
 * it (so a call that would revert says why instead of burning its fee), and waiting for the
 * transaction's receipt. Both read the node directly; it allows any origin.
 */

import { MARKET_ERRORS, selector } from './nft-market'

const WRONG_PAYMENT = selector('WrongPayment()')

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    cache: 'no-store',
  })
  const body = (await res.json()) as { result?: T; error?: { message: string; data?: unknown } }
  if (body.error) throw Object.assign(new Error(body.error.message), { data: body.error.data })
  return body.result as T
}

/**
 * Revert data the node put in its message as a Python bytes literal ("Call failed: b'x\x8aho'"),
 * as hex; null when the message has none.
 */
export function bytesLiteralHex(message: string): string | null {
  const m = /b(['"])((?:\\.|(?!\1).)*)\1/.exec(message)
  if (!m) return null
  const out: number[] = []
  const body = m[2]
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c !== '\\') {
      out.push(c.charCodeAt(0) & 0xff)
      continue
    }
    const n = body[++i]
    if (n === 'x') {
      out.push(parseInt(body.slice(i + 1, i + 3), 16))
      i += 2
    } else out.push({ n: 10, r: 13, t: 9, '0': 0, '\\': 92, "'": 39, '"': 34 }[n] ?? n.charCodeAt(0))
  }
  return '0x' + out.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The reason a call reverts, from its revert data: the market's errors, Error(string), or the node's message. */
export function revertReason(e: unknown): string {
  const err = e as { message?: string; data?: unknown }
  const data =
    typeof err.data === 'string'
      ? err.data
      : typeof (err.data as { data?: unknown })?.data === 'string'
        ? (err.data as { data: string }).data
        : bytesLiteralHex(err.message ?? '')
  if (data) {
    const known = MARKET_ERRORS[data.slice(0, 10).toLowerCase()]
    if (known) return known
    if (data.startsWith('0x08c379a0')) {
      try {
        const body = data.slice(10)
        const len = Number(BigInt('0x' + body.slice(64, 128)))
        const bytes = body.slice(128, 128 + len * 2).match(/../g) ?? []
        return new TextDecoder().decode(new Uint8Array(bytes.map((b) => parseInt(b, 16))))
      } catch {
        /* fall through */
      }
    }
  }
  const msg = err.message ?? String(e)
  for (const [sel, text] of Object.entries(MARKET_ERRORS)) if (msg.includes(sel.slice(2))) return text
  return msg.replace(/^.*execution reverted:?\s*/i, '') || 'The call would revert'
}

/** What a node answers eth_estimateGas with for a call that fails at any gas: its block limit and more. */
const ALWAYS_FAILS = 1_000_000n

/**
 * Run the call as `from` against the latest block; throws with the reason when it would revert.
 *
 * The node's eth_call runs every call without the QRDX it sends (qrdx-node main.py
 * eth_call_handler passes value 0), so a call that pays is checked in two parts: without the
 * value, where the only revert allowed is the market's WrongPayment (every check before the
 * payment passed), and by estimating its gas with the value, which the node does carry: a call
 * that fails at any gas comes back at the block limit or above.
 */
export async function dryRun(rpcUrl: string, call: { from: string; to: string; data: string; value?: bigint }): Promise<string> {
  const value = call.value ?? 0n
  let out = '0x'
  try {
    out = await rpc<string>(rpcUrl, 'eth_call', [{ from: call.from, to: call.to, data: call.data, value: '0x' + value.toString(16) }, 'latest'])
  } catch (e) {
    const reason = revertReason(e)
    if (!(value > 0n && reason === MARKET_ERRORS[WRONG_PAYMENT])) throw new Error(reason)
  }
  if (value > 0n) {
    const balance = BigInt(await rpc<string>(rpcUrl, 'eth_getBalance', [call.from, 'latest']))
    if (balance < value) throw new Error('Not enough QRDX in your trading account for this price and its fee.')
    const gas = BigInt(await rpc<string>(rpcUrl, 'eth_estimateGas', [{ from: call.from, to: call.to, data: call.data, value: '0x' + value.toString(16) }]))
    if (gas >= ALWAYS_FAILS) throw new Error('The call would fail with this payment: the listing may have just changed. Reload and try again.')
  }
  return out
}

/**
 * The gas limit for a type-0x51 call: an ordinary EVM estimate (which counts execution, the
 * 21,000 base, calldata and a creation's 32,000) plus what the post-quantum envelope adds
 * (40,000 to verify ML-DSA-65, 16 a byte for its 1,952-byte key and 3,309-byte signature),
 * with 10 % headroom. The node's own 0x51 estimate is the envelope floor alone.
 */
export async function pqGas(rpcUrl: string, call: { from: string; to: string | null; data: string; value?: bigint }): Promise<bigint> {
  const estimate = BigInt(
    await rpc<string>(rpcUrl, 'eth_estimateGas', [{ from: call.from, ...(call.to ? { to: call.to } : {}), data: call.data, value: '0x' + (call.value ?? 0n).toString(16) }])
  )
  return ((estimate + 40_000n + BigInt((1952 + 3309) * 16)) * 110n) / 100n
}

export interface EvmReceipt {
  status: string
  contractAddress: string | null
  blockNumber: string
}

/** Wait for a transaction's receipt (a block every 250 ms, so usually a second or two). */
export async function waitForReceipt(rpcUrl: string, hash: string, timeoutMs = 60_000): Promise<EvmReceipt> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const r = await rpc<EvmReceipt | null>(rpcUrl, 'eth_getTransactionReceipt', [hash]).catch(() => null)
    if (r) {
      if (r.status !== '0x1') throw new Error('The transaction was included but reverted; its fee was paid.')
      return r
    }
    await new Promise((res) => setTimeout(res, 750))
  }
  throw new Error('No receipt yet; check the transaction in the explorer.')
}

/** An exchange operation's receipt, from the trade API (receipts route), until it lands. */
export async function waitForExchange(apiBase: string, txHash: string, timeoutMs = 60_000): Promise<Record<string, unknown>> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const res = await fetch(`${apiBase}/receipts/${txHash}`, { cache: 'no-store' }).catch(() => null)
    // 404 until a block includes it; then the receipt itself.
    if (res?.ok) {
      const r = (await res.json()) as { success: boolean; error?: string; data?: Record<string, unknown> }
      if (!r.success) throw new Error(r.error || 'The operation failed')
      return r.data ?? {}
    }
    await new Promise((res) => setTimeout(res, 750))
  }
  throw new Error('No receipt yet; check the transaction in the explorer.')
}
