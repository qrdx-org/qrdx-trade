/**
 * Spot trade indexer: executed swaps, read from blocks.
 *
 * The node journals fill events for perps only, so spot history is rebuilt here
 * from each block's exchange section (`/get_blocks`) and the receipts of its
 * `SWAP` transactions, which carry the exact `amount_in` / `amount_out`.
 * Order-book matches from `PLACE_ORDER` are not included: their receipts carry
 * the filled size but not the fill prices (docs/ARCHITECTURE.md §7).
 *
 * State lives in the isolate, one per network. On first use it reads the last BACKFILL_BLOCKS
 * (about a day at 180 s blocks), then follows the tip on each request at most
 * every few seconds. A durable store (D1 / Durable Object) is phase 4.
 */

import { canonicalPair } from '../pairs'
import { dec, div, str } from '../decimal'
import { cached } from './cache'
import { mapLimit } from './util'
import type { Net } from './net'
import type { NodeReceipt } from './node'

/** SWAP in qrdx/exchange/transactions.py ExchangeOpType. */
const OP_SWAP = 4
const BACKFILL_BLOCKS = 600
const CHUNK = 200
const MAX_CHUNKS_PER_SYNC = 4
const MAX_TRADES_PER_PAIR = 5_000
const RECEIPT_CONCURRENCY = 8

/** One swap, in the node's canonical orientation (base = token0, price = token1 per token0). */
export interface IndexedTrade {
  id: string
  time: number
  blockHeight: number
  txHash: string
  pair: string
  /** token1 per token0 */
  price: string
  /** token0 amount */
  size: string
  /** token1 amount */
  quoteSize: string
  /** The taker bought token0 (paid token1)? */
  side: 'buy' | 'sell'
  venue: string
  poolId: string | null
}

interface State {
  fromBlock: number | null
  toBlock: number | null
  byPair: Map<string, IndexedTrade[]>
}

const states = new Map<string, State>()
function stateFor(net: Net): State {
  let s = states.get(net.slot)
  if (!s) states.set(net.slot, (s = { fromBlock: null, toBlock: null, byPair: new Map() }))
  return s
}

export function tradeFromSwap(
  tx: { tx_hash: string; params: Record<string, unknown> },
  r: NodeReceipt
): IndexedTrade | null {
  if (!r.success) return null
  const d = r.data as { amount_in?: string; amount_out?: string; source?: string; pool_id?: string | null }
  // Token addresses are stored lower-case (tokens.py deploy); normalise whatever the sender wrote.
  const tokenIn = String(tx.params.token_in ?? '').toLowerCase()
  const tokenOut = String(tx.params.token_out ?? '').toLowerCase()
  if (!tokenIn || !tokenOut || !d.amount_in || !d.amount_out) return null
  const amountIn = dec(d.amount_in)
  const amountOut = dec(d.amount_out)
  if (amountIn <= 0n || amountOut <= 0n) return null
  const { pair, token0 } = canonicalPair(tokenIn, tokenOut)
  // Paying token1 for token0 is a buy of the canonical base.
  const buy = tokenOut === token0
  const size = buy ? amountOut : amountIn
  const quoteSize = buy ? amountIn : amountOut
  return {
    id: `${r.tx_hash}:0`,
    time: Math.floor(r.block_time),
    blockHeight: r.block_height,
    txHash: r.tx_hash,
    pair,
    price: str(div(quoteSize, size)),
    size: str(size),
    quoteSize: str(quoteSize),
    side: buy ? 'buy' : 'sell',
    venue: d.source ?? 'amm',
    poolId: d.pool_id ?? null,
  }
}

async function syncOnce(net: Net): Promise<void> {
  const { node } = net
  const state = stateFor(net)
  const height = await node.height()
  if (height < 0) return
  if (state.toBlock !== null && height < state.toBlock) {
    // The chain is shorter than what we read (reorg, or the node was reset): start over.
    state.fromBlock = null
    state.toBlock = null
    state.byPair.clear()
  }
  let next = state.toBlock === null ? Math.max(0, height - BACKFILL_BLOCKS + 1) : state.toBlock + 1
  if (state.fromBlock === null) state.fromBlock = next
  for (let chunk = 0; chunk < MAX_CHUNKS_PER_SYNC && next <= height; chunk++) {
    const blocks = await node.blocks(next, Math.min(CHUNK, height - next + 1))
    if (!blocks.length) break
    const swaps = blocks.flatMap((b) =>
      (b.block.exchange_transactions ?? []).filter((t) => t.op_type === OP_SWAP && t.tx_hash)
    )
    const receipts = await mapLimit(swaps, RECEIPT_CONCURRENCY, (t) => node.receipt(t.tx_hash).catch(() => null))
    swaps.forEach((tx, k) => {
      const r = receipts[k]
      const trade = r && tradeFromSwap(tx, r)
      if (!trade) return
      const list = state.byPair.get(trade.pair) ?? []
      list.push(trade)
      if (list.length > MAX_TRADES_PER_PAIR) list.splice(0, list.length - MAX_TRADES_PER_PAIR)
      state.byPair.set(trade.pair, list)
    })
    const last = blocks[blocks.length - 1].block
    next = Number(last.block_height ?? last.id ?? next + blocks.length - 1) + 1
    state.toBlock = next - 1
  }
}

/** Bring the index up to the tip (rate-limited to once per 5 s per isolate). */
export function syncIndexer(net: Net): Promise<void> {
  return cached(net.key('indexer-sync'), 5_000, () => syncOnce(net))
}

/** Trades for a canonical pair, oldest first. */
export async function pairTrades(
  net: Net,
  pair: string
): Promise<{ trades: IndexedTrade[]; coverage: { fromBlock: number | null; toBlock: number | null } }> {
  const state = stateFor(net)
  await syncIndexer(net).catch((err) => console.warn(`[indexer] ${(err as Error).message}`))
  return {
    trades: state.byPair.get(pair.toLowerCase()) ?? [],
    coverage: { fromBlock: state.fromBlock, toBlock: state.toBlock },
  }
}
