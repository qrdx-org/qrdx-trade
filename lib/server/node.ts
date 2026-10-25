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
  /** Nodes from 2026-10: the order grid, the liquidity vault, a deployer market's deployer. */
  sz_decimals?: number | null
  liquidity_vault?: string | null
  deployer?: string | null
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
/** The node has no such method (JSON-RPC -32601): it predates it. */
class MethodMissing extends ApiError {}

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
    if (body.error.code === -32601) throw new MethodMissing('node_unavailable', `${method}: ${body.error.message}`)
    if (body.error.code === -32602) throw new ApiError('bad_request', body.error.message)
    throw new ApiError('node_unavailable', `${method}: ${body.error.message}`)
  }
  return body.result as T
}

/**
 * Several reads in one JSON-RPC batch (the node answers them concurrently). Each answer is its
 * result, or null when the node reported an error for it: one missing NFT is not a failure.
 */
async function rpcBatch<T>(cfg: ServerConfig, calls: { method: string; params: unknown[] }[]): Promise<(T | null)[]> {
  if (!calls.length) return []
  const first = ++rpcId
  let res: Response
  try {
    res = await fetch(cfg.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: '2.0', id: first + i, method: c.method, params: c.params }))),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS * 2),
      cache: 'no-store',
    })
  } catch (err) {
    throw new ApiError('node_unavailable', `QRDX node unreachable (batch of ${calls.length}): ${(err as Error).message}`)
  }
  if (!res.ok) throw new ApiError('node_unavailable', `QRDX node returned HTTP ${res.status} for a batch`)
  rpcId += calls.length
  const body = (await res.json().catch(() => null)) as { id: number; result?: T; error?: unknown }[] | null
  if (!Array.isArray(body)) throw new ApiError('node_unavailable', 'QRDX node sent an invalid batch response')
  const byId = new Map(body.map((r) => [r.id, r]))
  return calls.map((_, i) => {
    const r = byId.get(first + i)
    return r && !r.error && r.result !== undefined ? (r.result as T) : null
  })
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

/** A read a node may predate: null when it answers "Method not found" (or not found). */
async function optional<T>(cfg: ServerConfig, method: string, params: unknown[]): Promise<T | null> {
  try {
    return await rpc<T>(cfg, method, params)
  } catch (err) {
    if (err instanceof NotFound || isMissing(err)) return null
    throw err
  }
}

const isMissing = (err: unknown) => err instanceof MethodMissing

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

/** exchange_getNftCollection (qrdx-node exchange/nfts.py Collection.summary). */
export interface NodeNftCollection {
  collection: string
  name: string
  symbol: string
  uri: string
  creator: string
  max_supply: number | null
  supply: number
  minted: number
  burned: number
  royalty_bps: number
  royalty_recipient: string | null
  update_authority: string | null
  mint_authority: string | null
  non_transferable: boolean
  created_height: number
}

/** exchange_getNft / exchange_getNftsOf (Nft.summary, with the collection's name and royalties). */
export interface NodeNft {
  collection: string
  token_id: string
  owner: string
  uri: string
  name: string
  approved: string | null
  minted_height: number
  symbol?: string
  collection_name?: string
  royalty_bps?: number
  royalty_recipient?: string | null
  non_transferable?: boolean
}

/** A row of /get_address_history (qrdx-node tx_index.py). */
export interface NodeIndexedTx {
  block_height: number
  tx_hash: string
  timestamp: number | null
  kind: string
  op: string | null
  sender: string | null
  status: string | null
  detail: { params?: Record<string, unknown>; collection?: string; token_id?: string | number } | null
}

/** staking_getValidators (qrdx-node docs/STAKING.md): the validator set in force at the tip. */
export interface NodeStakingValidator {
  address: string
  status: string
  stake: string
  effective_stake: string
  /** QRDX in its delegation pool. */
  delegated: string
  /** Own effective stake plus delegated: what it is selected and votes with. */
  weight: string
  earned: string
  activation_epoch: number | null
  exit_epoch: number | null
  slashed: boolean
}

/** staking_getPools: a validator's delegation pool. */
export interface NodeStakingPool {
  validator: string
  commission_bps: number
  next_commission_bps: number | null
  value: string
  total_shares: string
  share_price: string
  delegators: number
  warming_up: string
}

export interface NodeStakingParams {
  reward_rate_bps_per_year: number
  reward_rate_per_epoch: string
  default_commission_bps: number
  min_delegation: string
  min_validator_stake: string
  warmup_epochs: number
  unbonding_epochs: number
  withdrawal_delay_epochs: number
}

/** staking_getDelegations: an address's stake in each pool and the payouts owed to it. */
export interface NodeDelegations {
  address: string
  stakes: { validator: string; shares: string; value: string; warming_up: { amount: string; active_from_epoch: number }[] }[]
  payouts: { id: number; kind: string; amount: string; due_epoch: number; validator: string }[]
}

/** The parts of /chain_spec (qrdx_chainSpec) the staking page needs. */
export interface NodeChainSpec {
  network: string
  chain_id: number
  params: { SLOT_DURATION_MS: number; SLOTS_PER_EPOCH: number; [key: string]: unknown }
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


// ─── Trading features (qrdx-node docs/TRADING_FEATURES.md) ─────────────────────
// Nodes before the 2026-10 release answer these with "Method not found": see `features`.

/** perp_getTriggers rows: perps triggers judge the mark price, spot ones the pair's last trade. */
export interface NodeTrigger {
  kind_of: 'perp' | 'spot'
  order_id: string
  /** A perp market id, or a spot pair (token0:token1). */
  market: string
  side: 'buy' | 'sell'
  kind: string
  trigger_price: string
  /** "position" for a position's TP/SL, which closes whatever the position is when it fires. */
  size: string
  limit_price: string | null
  reduce_only?: boolean
  escrowed?: string
  tif: string
  max_makers: number
  seq: number
}

/** perp_getTwaps rows. */
export interface NodeTwap {
  twap_id: string
  perp: boolean
  market: string
  side: 'buy' | 'sell' | null
  token_in: string | null
  token_out: string | null
  total: string
  done: string
  received: string
  slices: number
  slices_done: number
  interval: string
  next_time: string
  reduce_only: boolean
  max_slippage: string
}

/** perp_getFeeSchedule: the tiers, and with an address its 14-day volume, rates and referral. */
export interface NodeFeeSchedule {
  volume_days: number
  tiers: { volume: string; taker: string; maker: string }[]
  referral: { referee_discount: string; referrer_share: string; volume_cap: string; join_before_volume: string }
  volume?: string
  taker?: string
  maker?: string
  referrer?: string | null
  referred_volume?: string | null
  referral_code?: string | null
}

/** exchange_getFreeActions (docs/TOKENOMICS.md). */
export interface NodeFreeActions {
  address: string
  budget: number
  used: number
  remaining: number
  lane_open: boolean
  free_now: boolean
  why_not: string | null
}

/** history_* pages: newest first; pass next_cursor back as cursor. */
export interface NodeHistoryPage<T> {
  items: T[]
  next_cursor: string | null
}

export interface NodeHistoryTrade {
  block_height: number
  block_time: number
  market: string
  venue: string
  kind: string
  price: string
  amount: string
  side: 'buy' | 'sell'
  buyer: string
  seller: string
  maker: string
  taker: string
  maker_order_id: string | null
  taker_order_id: string | null
  tx_hash: string | null
  fees: Record<string, string> | null
  realized: Record<string, string> | null
  /** With an address: its role (maker / taker), side, fee and realized PnL. */
  role?: string
  account_side?: string
  fee?: string | null
  account_realized?: string | null
  cursor: string
}

export interface NodeHistoryOrder {
  block_height: number
  block_time: number
  account: string
  market: string
  order_id: string
  event: string
  tx_hash: string | null
  detail: Record<string, unknown> | null
  cursor: string
}

export interface NodeHistoryFunding {
  block_height: number
  block_time: number
  market: string
  rate: string
  premium: string
  oracle_price: string
  open_interest: string
  funding_time: string
  cursor: string
}

export interface NodeLeaderRow {
  account: string
  pnl: number
  volume: number
  trades: number
}

/** perp_getUserVaults / perp_getUserVault. */
export interface NodeUserVault {
  vault: string
  leader: string
  name: string
  profit_share: string
  created: string
  managed: string | null
  nav: string
  total_shares: string
  share_value: string | null
  leader_shares: string
  holders: number
  withdrawable: string
  lockup_seconds: string
  positions: Record<string, { size: string; entry_price: string }>
  holder?: { shares: string; cost: string; value: string; unlock_time?: string } | null
}

export interface NodeAgent {
  agent: string
  name: string
  valid_until: string
  max_notional_per_day?: string
  placed_today?: string
}

/** What a node runs beyond the original exchange. */
export interface NodeFeatures {
  /** The 2026-10 release: triggers, modify, batch, TWAP, agents, vaults, history, QNS, the free lane. */
  trading: boolean
  /** The trading history database (QRDX_TRADING_HISTORY), node-local. */
  history: boolean
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

    // Staking and delegation pools (docs/STAKING.md). Writes are STAKE_* exchange transactions.
    stakingValidators: () => rpc<NodeStakingValidator[]>(cfg, 'staking_getValidators'),
    stakingPools: () => rpc<NodeStakingPool[]>(cfg, 'staking_getPools'),
    stakingParams: () => rpc<NodeStakingParams>(cfg, 'staking_getParams'),
    delegations: (address: string) => rpc<NodeDelegations>(cfg, 'staking_getDelegations', [address]),
    chainSpec: () => rpc<NodeChainSpec>(cfg, 'qrdx_chainSpec'),

    // Trading features (docs/TRADING_FEATURES.md); null on a node that predates them.
    features: async (): Promise<NodeFeatures> => {
      const [fees, hist] = await Promise.all([
        optional<NodeFeeSchedule>(cfg, 'perp_getFeeSchedule', []).catch(() => null),
        optional<NodeLeaderRow[]>(cfg, 'history_getLeaderboard', ['day', 'volume', 1]).catch(() => null),
      ])
      return { trading: fees !== null, history: hist !== null }
    },
    triggers: (address: string) => optional<NodeTrigger[]>(cfg, 'perp_getTriggers', [address]),
    twaps: (address: string) => optional<NodeTwap[]>(cfg, 'perp_getTwaps', [address]),
    feeSchedule: (address?: string) => optional<NodeFeeSchedule>(cfg, 'perp_getFeeSchedule', address ? [address] : []),
    freeActions: (address: string) => optional<NodeFreeActions>(cfg, 'exchange_getFreeActions', [address]),
    agents: (address: string) => optional<NodeAgent[]>(cfg, 'exchange_getAgents', [address]),
    subaccounts: (address: string) =>
      optional<{ subaccount: string; index: number; name: string }[]>(cfg, 'exchange_getSubaccounts', [address]),
    userVaults: (leader?: string) => optional<NodeUserVault[]>(cfg, 'perp_getUserVaults', leader ? [leader] : []),
    userVault: (vault: string, holder?: string) => optional<NodeUserVault>(cfg, 'perp_getUserVault', holder ? [vault, holder] : [vault]),
    historyTrades: (q: { address?: string; market?: string; limit?: number; cursor?: string | null }) =>
      optional<NodeHistoryPage<NodeHistoryTrade>>(cfg, 'history_getTrades', [q.address ?? null, q.market ?? null, q.limit ?? 100, q.cursor ?? null]),
    historyOrders: (q: { address?: string; market?: string; orderId?: string; limit?: number; cursor?: string | null }) =>
      optional<NodeHistoryPage<NodeHistoryOrder>>(cfg, 'history_getOrders', [q.address ?? null, q.market ?? null, q.orderId ?? null, q.limit ?? 100, q.cursor ?? null]),
    historyFunding: (market: string, limit = 100, cursor: string | null = null) =>
      optional<NodeHistoryPage<NodeHistoryFunding>>(cfg, 'history_getFunding', [market, limit, cursor]),
    leaderboard: (window: string, metric: string, limit: number) =>
      optional<NodeLeaderRow[]>(cfg, 'history_getLeaderboard', [window, metric, limit]),
    qnsResolve: (name: string) => optional<string | null>(cfg, 'qns_resolve', [name]),
    qnsReverse: (address: string) => optional<string | null>(cfg, 'qns_reverse', [address]),
    qnsPrice: (years: number) => optional<string>(cfg, 'qns_price', [years]),

    // Native NFTs (docs/NATIVE_TOKENS.md §8) and the EVM reads the NFT market needs.
    nftCollections: () => rpc<NodeNftCollection[]>(cfg, 'exchange_getNftCollections'),
    nftCollection: (collection: string) => maybe<NodeNftCollection>(cfg, 'exchange_getNftCollection', [collection]),
    nft: (collection: string, tokenId: string) => maybe<NodeNft>(cfg, 'exchange_getNft', [collection, tokenId]),
    nftsOf: (owner: string, collection: string | null, limit: number) => rpc<NodeNft[]>(cfg, 'exchange_getNftsOf', [owner, collection, limit]),
    /** Many reads in batches of 100; null where a read failed (a burned NFT, an unknown id). */
    batch: async <T>(calls: { method: string; params: unknown[] }[]): Promise<(T | null)[]> => {
      const out: (T | null)[] = []
      for (let i = 0; i < calls.length; i += 100) out.push(...(await rpcBatch<T>(cfg, calls.slice(i, i + 100))))
      return out
    },
    logs: (filter: { address: string; fromBlock: number; toBlock?: number }) =>
      rpc<{ address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[]>(cfg, 'eth_getLogs', [
        { address: filter.address, fromBlock: '0x' + Math.max(0, filter.fromBlock).toString(16), toBlock: filter.toBlock != null ? '0x' + filter.toBlock.toString(16) : 'latest' },
      ]),
    code: (address: string) => rpc<string>(cfg, 'eth_getCode', [address, 'latest']),
    /** An account's history from the node's transaction index (tx_index.py), newest first. */
    history: (address: string, opts: { kinds?: string; limit?: number; cursor?: string | null } = {}) =>
      rest<{ transactions: NodeIndexedTx[]; next_cursor: string | null }>(
        cfg,
        `/get_address_history?address=${encodeURIComponent(address)}&limit=${opts.limit ?? 500}${opts.kinds ? `&kinds=${opts.kinds}` : ''}${opts.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : ''}`
      ),

    /** Height and last block hash (`/get_status`, which the node does not cost-limit). */
    status: () => rest<{ height: number; last_block_hash?: string }>(cfg, '/get_status'),
    /** Chain height (last block). REST, because the eth_* namespace is optional on a node. */
    height: async (): Promise<number> => (await rest<{ height: number }>(cfg, '/get_status')).height,
    /**
     * A block's epoch, from its header (`/get_block`, not cost-limited). The header is stored
     * as a Python dict repr; null for genesis or a header without one.
     */
    blockEpoch: async (height: number): Promise<number | null> => {
      const r = await rest<{ block?: { content?: string | null } }>(cfg, `/get_block?block=${Math.max(0, height)}`)
      const m = /['"]epoch['"]:\s*(\d+)/.exec(r.block?.content ?? '')
      return m ? Number(m[1]) : null
    },
    /** Blocks from `start` (inclusive), ascending, with their exchange sections. */
    blocks: (start: number, limit: number) =>
      rest<NodeBlock[]>(cfg, `/get_blocks?offset=${Math.max(0, start)}&limit=${Math.min(512, limit)}`),
  }
}

export type NodeClient = ReturnType<typeof createNodeClient>
