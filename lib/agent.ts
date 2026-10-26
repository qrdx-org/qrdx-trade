/**
 * One-click trading: a key this browser holds, which the wallet approves once as an agent of
 * the account (AGENT_APPROVE; qrdx-node docs/TRADING_FEATURES.md §8). Afterwards orders,
 * cancels, edits, triggers, TWAPs and swaps are signed here and sent to the node directly,
 * without a wallet prompt each. An agent can never withdraw, transfer or deposit; it can lose
 * money only by trading. Its approval expires (AGENT_TTL), and turning it off revokes it on
 * chain, signed by the agent itself.
 *
 * The key is kept in this browser's storage, per network and account: clearing site data
 * forgets it (its approval then lapses at its expiry, or the wallet revokes it).
 */

import { AGENT_SCOPE, OP_CODES, keyFromSeed, newKey, signTx, type PqKey, type UnsignedTx } from './exchange-sign'

/** How long one approval lasts. */
export const AGENT_TTL_SECONDS = 7 * 86_400

export interface StoredAgent {
  seed: string
  address: string
  /** Block time the approval ends. */
  validUntil: number
  /** False until the node lists the approval. */
  approved: boolean
}

const key = (slot: string, owner: string) => `qrdx-trade:agent:${slot}:${owner.toLowerCase()}`

export function loadAgent(slot: string, owner: string): StoredAgent | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key(slot, owner)) ?? 'null') as StoredAgent | null
    if (!raw || typeof raw.seed !== 'string' || !/^[0-9a-f]{64}$/.test(raw.seed)) return null
    return raw
  } catch {
    return null
  }
}

export function saveAgent(slot: string, owner: string, agent: StoredAgent | null) {
  try {
    if (agent) localStorage.setItem(key(slot, owner), JSON.stringify(agent))
    else localStorage.removeItem(key(slot, owner))
  } catch {
    /* it then lasts as long as this page */
  }
}

export function createAgent(): { key: PqKey; stored: StoredAgent } {
  const k = newKey()
  return { key: k, stored: { seed: k.seed, address: k.address, validUntil: Math.floor(Date.now() / 1000) + AGENT_TTL_SECONDS, approved: false } }
}

/** Whether the agent may sign this operation (a batch: every action). */
export function inAgentScope(op: string, params: Record<string, unknown>): boolean {
  if (op === 'BATCH') {
    const actions = params.actions
    return Array.isArray(actions) && actions.length > 0 && actions.every((a) => !!a && typeof a === 'object' && AGENT_SCOPE.has(String((a as { op?: unknown }).op)))
  }
  return AGENT_SCOPE.has(op) || op === 'AGENT_REVOKE'
}

let rpcId = 0
async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) })
  const body = (await res.json().catch(() => null)) as { result?: T; error?: { message: string } } | null
  if (!body) throw new Error(`The node sent no answer to ${method}`)
  if (body.error) throw new Error(body.error.message)
  return body.result as T
}

/** The next nonce of each lane this page has used, ahead of what the node has committed. */
const lanes = new Map<string, number>()

/**
 * Sign `op` with the agent for `sender` (the account, or a sub-account or vault of it) and send
 * it. Goes in the free trading lane when the account has free actions; pays otherwise.
 */
export async function agentSend(opts: {
  rpcUrl: string
  chainId: number
  agent: StoredAgent
  sender: string
  op: string
  params: Record<string, unknown>
  gasLimit?: number
}): Promise<{ txHash: string; nonce: number }> {
  const code = OP_CODES[opts.op]
  if (code === undefined || !inAgentScope(opts.op, opts.params)) throw new Error(`One-click trading cannot sign ${opts.op}`)
  const k = keyFromSeed(opts.agent.seed)
  const lane = `${opts.chainId}:${opts.sender}|${k.address}`
  const [committed, free, paid] = await Promise.all([
    rpc<number>(opts.rpcUrl, 'exchange_getNonce', [opts.sender, k.address]),
    rpc<{ free_now: boolean }>(opts.rpcUrl, 'exchange_getFreeActions', [opts.sender]).catch(() => null),
    rpc<number | string>(opts.rpcUrl, 'exchange_gasPrice', []).catch(() => 100_000_000),
  ])
  // The free lane takes trading operations only (an agent revoking itself pays).
  const freeOp = opts.op !== 'AGENT_REVOKE'
  let gasPrice = free?.free_now && freeOp ? '0' : String(paid)
  let nonce = Math.max(Number(committed), lanes.get(lane) ?? 0)
  for (let attempt = 0; attempt < 8; attempt++) {
    const tx: UnsignedTx = {
      op_type: code,
      chain_id: opts.chainId,
      sender: opts.sender,
      signer: k.address,
      nonce,
      params: opts.params,
      gas_limit: opts.gasLimit ?? 1_000_000,
      gas_price: gasPrice,
    }
    try {
      const txHash = await rpc<string>(opts.rpcUrl, 'exchange_sendTransaction', [signTx(tx, k)])
      lanes.set(lane, nonce + 1)
      return { txHash, nonce }
    } catch (e) {
      const msg = (e as Error).message
      // The free lane refused it after all (it consumed nothing): pay.
      if (gasPrice === '0' && /pay gas/i.test(msg)) {
        gasPrice = String(paid)
        continue
      }
      // An earlier one of ours is still waiting for a block: take the next nonce.
      // (The node's words, as the wallet matches them: qrdx-wallet exchange-nonce.ts.)
      if (/already queued|nonce too low|duplicate/i.test(msg)) {
        nonce++
        continue
      }
      throw e
    }
  }
  throw new Error('Could not find a free nonce for the trading key')
}
