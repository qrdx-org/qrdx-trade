'use client'

/**
 * The browser's side of the NFT market: a dry run of each contract call before the wallet signs
 * it (so a call that would revert says why instead of burning its fee), and waiting for the
 * transaction's receipt. Both read the node directly; it allows any origin.
 */

import { MARKET_ERRORS } from './nft-market'

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

/** The reason a call reverts, from its revert data: the market's errors, Error(string), or the node's message. */
export function revertReason(e: unknown): string {
  const err = e as { message?: string; data?: unknown }
  const data = typeof err.data === 'string' ? err.data : typeof (err.data as { data?: unknown })?.data === 'string' ? (err.data as { data: string }).data : null
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

/** Run the call as `from` against the latest block; throws with the reason when it would revert. */
export async function dryRun(rpcUrl: string, call: { from: string; to: string; data: string; value?: bigint }): Promise<string> {
  try {
    return await rpc<string>(rpcUrl, 'eth_call', [{ from: call.from, to: call.to, data: call.data, value: '0x' + (call.value ?? 0n).toString(16) }, 'latest'])
  } catch (e) {
    throw new Error(revertReason(e))
  }
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
