/**
 * Typed client for the QRDX node's exchange surface.
 *
 * Reads use JSON-RPC (`exchange_*`, `perp_*`, always enabled on every node);
 * block history uses the REST API (`/get_status`, `/get_blocks`). The shapes
 * mirror qrdx-node `qrdx/exchange/views.py`, which every node surface shares.
 * All amounts are decimal strings.
 */

import type { ServerConfig } from '../config'
import { ApiError } from './http'

// ─── Node shapes (views.py) ────────────────────────────────────────────────────

export interface NodeToken {
  token_address: string
  name: string
  symbol: string
  decimals: number
  total_supply: string
  max_supply: string | null
  mint_authority: string | null
  freeze_authority: string | null
  creator: string
  created_height: number
}

export interface NodePool {
  pool_id: string
  token0: string
  token1: string
  fee_tier: number
  fee_rate: string
  tick_spacing: number
  pool_type: string
  creator: string
  stake: string
  /** token1 per token0 */
  price: string
  sqrt_price_x96: string
  tick: number
  liquidity: string
  positions: number
  protocol_fees: [string, string]
  volume: [string, string]
  holder_address: string
  paused: boolean
}

export interface NodeLpPosition {
  position_id: string
  pool_id: string
  owner: string
  token0: string
  token1: string
  tick_lower: number
  tick_upper: number
  price_lower: string
  price_upper: string
  liquidity: string
  in_range: boolean
  amount0: string
  amount1: string
  fees0: string
  fees1: string
}

export interface NodePoolDetail extends NodePool {
  ticks: { tick: number; liquidity_net: string; liquidity_gross: string }[]
  position_list: NodeLpPosition[]
  twap?: { window: number; as_of: number; price: string | null }
}

export interface NodeSpotBook {
  pair: string
  base: string
  quote: string
  bids: [string, string][]
  asks: [string, string][]
  best_bid: string | null
  best_ask: string | null
  escrow_address: string
}

export interface NodeSpotOrder {
  pair: string
  order_id: string
  side: 'buy' | 'sell'
  order_type: string
  price: string
  amount: string
  filled: string
  remaining: string
}

export interface NodeSwapQuote {
  source: 'amm' | 'clob'
  pool_id: string | null
  pair: string
  token_in: string
  token_out: string
  amount_in: string
  amount_out: string
  unfilled_in: string
  fee: string
  /** token_in paid per token_out received */
  execution_price: string
  price_before?: string
  price_after?: string
  price_impact?: string | null
}

export interface NodeLiquidityQuote {
  pool_id: string
  token0: string
  token1: string
  tick_lower: number
  tick_upper: number
  liquidity: string
  amount0: string
  amount1: string
  in_range: boolean
  price: string
}

export interface NodePerpMarket {
  market_id: string
  base: string
  quote: string
  max_leverage: string | null
  maintenance_rate: string | null
  oracle_price: string | null
  oracle_time: string | null
  mark_price: string | null
  last_trade_price: string | null
  open_interest: string | null
  best_bid: string | null
  best_ask: string | null
  funding_rate: string | null
  funding_time: string | null
  next_funding_time: string | null
}

export interface NodePerpBook {
  market_id: string
  bids: [string, string][]
  asks: [string, string][]
  mark_price: string | null
  oracle_price: string | null
  last_trade_price: string | null
}

export interface NodePerpPosition {
  size: string
  entry_price: string
  mark_price: string
  isolated: boolean
  isolated_margin: string
  notional: string
  unrealized_pnl: string
  leverage: string
  liquidation_price: string | null
}

export interface NodePerpOrder {
  market_id: string
  order_id: string
  side: 'buy' | 'sell'
  price: string
  size: string
  filled: string
  remaining: string
  reduce_only: boolean
  leverage: string
}

export interface NodePerpAccount {
  address: string
  exchange_nonce: number
  collateral: string
  withdrawable: string
  equity: string
  maintenance_margin: string
  initial_margin: string
  open_order_margin: string
  positions: Record<string, NodePerpPosition>
  leverage: Record<string, { leverage: string; mode: 'cross' | 'isolated' }>
  orders: NodePerpOrder[]
  vault_shares: string
  vault_unlock_time: string
  holder_address: string
  holder_balance: string
  collateral_token: string
}

export interface NodeFillEvent {
  seq: number
  type: 'fill'
  block_height: number
  block_time: number
  tx_hash: string | null
  order_id: string | null
  taker: string
  liquidation: boolean
  market: string
  price: string
  amount: string
  buyer: string
  seller: string
  maker: string
  /** Realized PnL of each side of the fill, in collateral units (perp_getEvents fills). */
  realized?: Record<string, string>
}

export interface NodeReceipt {
  tx_hash: string
  block_height: number
  block_time: number
  op: string
  sender: string
  nonce: number
  success: boolean
  error: string
  gas_used: number
  gas_price: number
  fee: string
  data: Record<string, unknown>
}

/** An entry of a block's exchange section (ExchangeTransaction.to_dict()). */
export interface NodeBlockExchangeTx {
  op_type: number
  sender: string
  nonce: number
  params: Record<string, unknown>
  tx_hash: string
  timestamp: number
}

export interface NodeBlock {
  block: {
    block_height?: number
    id?: number
    timestamp?: number | string
    hash?: string
    exchange_transactions?: NodeBlockExchangeTx[]
  }
}

// ─── Transport ─────────────────────────────────────────────────────────────────

const RPC_TIMEOUT_MS = 6_000
/** RPCErrorCode.RESOURCE_NOT_FOUND in qrdx/rpc/server.py. */
const NOT_FOUND = -32001

class NotFound extends Error {}

let rpcId = 0

async function rpc<T>(cfg: ServerConfig, method: string, params: unknown[] = []): Promise<T> {
  const { rpcUrl } = cfg
  let res: Response
  try {
    res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (err) {
    throw new ApiError('node_unavailable', `QRDX node unreachable (${method}): ${(err as Error).message}`)
  }
  if (!res.ok) throw new ApiError('node_unavailable', `QRDX node returned HTTP ${res.status} for ${method}`)
  const body = (await res.json().catch(() => null)) as
    | { result?: T; error?: { code: number; message: string } }
    | null
  if (!body) throw new ApiError('node_unavailable', `QRDX node sent an invalid response for ${method}`)
  if (body.error) {
    if (body.error.code === NOT_FOUND) throw new NotFound(body.error.message)
    if (body.error.code === -32602) throw new ApiError('bad_request', body.error.message)
    throw new ApiError('node_unavailable', `${method}: ${body.error.message}`)
  }
  return body.result as T
}

/** A read whose "not found" is an answer, not a failure. */
async function maybe<T>(cfg: ServerConfig, method: string, params: unknown[]): Promise<T | null> {
  try {
    return await rpc<T>(cfg, method, params)
  } catch (err) {
    if (err instanceof NotFound) return null
    throw err
  }
}

async function rest<T>(cfg: ServerConfig, path: string): Promise<T> {
  const { nodeUrl } = cfg
  let res: Response
  try {
    res = await fetch(`${nodeUrl}${path}`, {
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS * 2),
      cache: 'no-store',
    })
  } catch (err) {
    throw new ApiError('node_unavailable', `QRDX node unreachable (${path}): ${(err as Error).message}`)
  }
  if (!res.ok) throw new ApiError('node_unavailable', `QRDX node returned HTTP ${res.status} for ${path}`)
  const body = (await res.json()) as { ok: boolean; result?: T; error?: string } & Record<string, unknown>
  if (body.ok === false) throw new ApiError('node_unavailable', `${path}: ${body.error ?? 'error'}`)
  return (body.result ?? body) as T
}

/** market_getTicker / market_getMarkets (qrdx-node docs/PERPS_API.md §8). Prices quote per base of the canonical pair. */
export interface NodeTicker {
  market: string
  type: 'spot' | 'perp'
  base: string
  quote: string
  best_bid: string | null
  best_ask: string | null
  last_price: string | null
  open_24h: string | null
  high_24h: string | null
  low_24h: string | null
  change_pct_24h: string | null
  volume_24h: string
  quote_volume_24h: string
  trades_24h: number
  amm_price?: string | null
  pools?: number
}

/** market_getTrades rows: the taker's side, venue clob | amm | perp. */
export interface NodeMarketTrade {
  seq: number
  market: string
  price: string
  amount: string
  quote_amount: string
  side: 'buy' | 'sell'
  venue: string
  block_height: number
  block_time: number
  tx_hash: string | null
  maker: string | null
  taker: string | null
  pool_id: string | null
}

/** market_getCandles rows, by block time. Only intervals with trades appear. */
export interface NodeMarketCandle {
  time: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  quote_volume: string
  trades: number
}

// ─── Reads ─────────────────────────────────────────────────────────────────────

/** A client for one network's node. */
export function createNodeClient(cfg: ServerConfig) {
  return {
    tokens: () => rpc<NodeToken[]>(cfg, 'exchange_getTokens'),
    token: (address: string) => maybe<NodeToken>(cfg, 'exchange_getToken', [address]),
    tokenBalance: (token: string, address: string) =>
      rpc<string>(cfg, 'exchange_getTokenBalance', [token, address]),

    pools: (tokenA?: string, tokenB?: string) =>
      rpc<NodePool[]>(cfg, 'exchange_getPools', tokenA && tokenB ? [tokenA, tokenB] : []),
    pool: (poolId: string, twapWindow?: number) =>
      maybe<NodePoolDetail>(cfg, 'exchange_getPool', twapWindow ? [poolId, twapWindow] : [poolId]),
    positions: (address: string) => rpc<NodeLpPosition[]>(cfg, 'exchange_getPositions', [address]),

    quoteSwap: (tokenIn: string, tokenOut: string, amountIn: string, sender = '', poolId?: string, venue = 'auto') =>
      maybe<NodeSwapQuote>(cfg, 'exchange_quoteSwap', [tokenIn, tokenOut, amountIn, sender, poolId ?? null, venue]),
    quoteLiquidity: (
      poolId: string,
      tickLower: number,
      tickUpper: number,
      amounts: { liquidity?: string; amount0?: string; amount1?: string }
    ) =>
      maybe<NodeLiquidityQuote>(cfg, 'exchange_quoteLiquidity', [
        poolId,
        tickLower,
        tickUpper,
        amounts.liquidity ?? null,
        amounts.amount0 ?? null,
        amounts.amount1 ?? null,
      ]),

    spotBook: (pair: string, depth: number) => maybe<NodeSpotBook>(cfg, 'exchange_getOrderBook', [pair, depth]),
    spotOrders: (address: string) => rpc<NodeSpotOrder[]>(cfg, 'exchange_getOpenOrders', [address]),

    nonce: (address: string) => rpc<number>(cfg, 'exchange_getNonce', [address]),
    receipt: (txHash: string) => rpc<NodeReceipt | null>(cfg, 'exchange_getTransactionReceipt', [txHash]),

    perpMarkets: () => rpc<NodePerpMarket[]>(cfg, 'perp_getMarkets'),
    perpMarket: (id: string) => maybe<NodePerpMarket>(cfg, 'perp_getMarket', [id]),
    perpBook: (id: string, depth: number) => maybe<NodePerpBook>(cfg, 'perp_getOrderBook', [id, depth]),
    perpAccount: (address: string) => rpc<NodePerpAccount>(cfg, 'perp_getAccount', [address]),
    perpTrades: (id: string, limit: number) => rpc<NodeFillEvent[]>(cfg, 'perp_getTrades', [id, limit]),
    /** An account's perps fills (buyer or seller), newest last; each carries its realized PnL. */
    perpFills: (address: string, limit: number) =>
      rpc<{ events: NodeFillEvent[]; last_seq: number }>(cfg, 'perp_getEvents', [null, address, ['fill'], null, limit]),

    /** Native QRDX of an account, in QRDX (eth_getBalance is in wei). Spot and perps spend it directly. */
    nativeBalance: async (address: string): Promise<string> => {
      const wei = BigInt(await rpc<string>(cfg, 'eth_getBalance', [address, 'latest']))
      const whole = wei / 10n ** 18n
      const frac = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '')
      return frac ? `${whole}.${frac}` : `${whole}`
    },

    // Market data built from the blocks (PERPS_API.md §8). Older nodes lack these: callers fall back.
    marketTickers: (kind?: 'spot' | 'perp') => rpc<NodeTicker[]>(cfg, 'market_getMarkets', kind ? [kind] : []),
    marketTrades: (market: string, limit: number) =>
      rpc<{ trades: NodeMarketTrade[]; last_seq: number } | null>(cfg, 'market_getTrades', [market, limit]),
    marketCandles: (market: string, interval: string, limit: number) =>
      rpc<{ candles: NodeMarketCandle[] } | null>(cfg, 'market_getCandles', [market, interval, limit]),

    /** Height and last block hash (`/get_status`, which the node does not cost-limit). */
    status: () => rest<{ height: number; last_block_hash?: string }>(cfg, '/get_status'),
    /** Chain height (last block). REST, because the eth_* namespace is optional on a node. */
    height: async (): Promise<number> => (await rest<{ height: number }>(cfg, '/get_status')).height,
    /** Blocks from `start` (inclusive), ascending, with their exchange sections. */
    blocks: (start: number, limit: number) =>
      rest<NodeBlock[]>(cfg, `/get_blocks?offset=${Math.max(0, start)}&limit=${Math.min(512, limit)}`),
  }
}

export type NodeClient = ReturnType<typeof createNodeClient>
