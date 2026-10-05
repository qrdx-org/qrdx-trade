/**
 * Response shapes of /api/v1 (docs/API.md), shared by the route handlers and
 * the pages. Amounts and prices are decimal strings.
 */

import type { LevelWithTotal } from './pairs'

export type DataSource = 'node' | 'indexer' | 'coinbase' | 'kraken' | 'coingecko'

export interface ApiAsset {
  segment: string
  slug: string | null
  symbol: string
  name: string
  verified: boolean
  /** Token address on this network; null when the asset has no token here yet. */
  address: string | null
  onChainSymbol: string | null
  decimals: number
  color: string
  /** Verified asset with a token on this network. Unverified tokens are always listed. */
  listed: boolean
}

export interface IndexPrice {
  price: string
  change24h: string | null
  high24h: string | null
  low24h: string | null
  volume24h: string | null
  source: DataSource
  asOf: number
}

export interface PoolSummary {
  poolId: string
  feeTier: number
  feeRate: string
  tickSpacing: number
  /** Oriented to the market: quote per base. */
  price: string | null
  liquidity: string
  positions: number
  paused: boolean
  token0: string
  token1: string
  holderAddress: string
}

export type SpotStatus = 'live' | 'no_market' | 'unlisted' | 'node_unavailable'

export interface SpotMarket {
  type: 'spot'
  id: string
  path: string
  status: SpotStatus
  base: ApiAsset
  quote: ApiAsset
  /** Node canonical pair (`token0:token1`), when both tokens exist. */
  pair: string | null
  inverted: boolean
  last: string | null
  lastSource: 'trade' | 'pool' | null
  bestBid: string | null
  bestAsk: string | null
  mid: string | null
  spread: string | null
  change24h: string | null
  /** Quote units over the last 24 h of indexed trades. */
  volume24h: string | null
  pools: PoolSummary[]
  /** base/quote implied by USD index prices. */
  indexPrice: string | null
  baseIndex: IndexPrice | null
  quoteIndex: IndexPrice | null
  source: DataSource
  asOf: number
}

export interface PerpMarket {
  type: 'perp'
  id: string
  path: string
  base: string
  quote: string
  baseAsset: ApiAsset | null
  markPrice: string | null
  oraclePrice: string | null
  oracleTime: number | null
  lastTradePrice: string | null
  openInterest: string | null
  bestBid: string | null
  bestAsk: string | null
  fundingRate: string | null
  fundingTime: number | null
  nextFundingTime: number | null
  maxLeverage: string | null
  maintenanceRate: string | null
  change24h: string | null
  volume24h: string | null
  indexPrice: string | null
  indexSource: DataSource | null
  source: DataSource
  asOf: number
}

export interface OrderBook {
  market: string
  bids: LevelWithTotal[]
  asks: LevelWithTotal[]
  bestBid: string | null
  bestAsk: string | null
  mid: string | null
  spread: string | null
  spreadBps: string | null
  escrowAddress?: string
  markPrice?: string | null
  oraclePrice?: string | null
  source: DataSource
  asOf: number
}

export interface Trade {
  id: string
  time: number
  price: string
  size: string
  side: 'buy' | 'sell'
  venue: string
  txHash: string | null
  blockHeight: number
  liquidation?: boolean
}

export interface TradesResponse {
  market: string
  trades: Trade[]
  source: DataSource
  coverage?: { fromBlock: number | null; toBlock: number | null }
  asOf: number
}

export interface Candle {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

export interface CandleSeries {
  market: string
  interval: string
  /** `market`: built from this market's trades. `index`: reference prices from public exchanges. */
  kind: 'market' | 'index' | 'none'
  /** False when high/low are bounds derived from two series rather than observed. */
  exact: boolean
  label: string
  candles: Candle[]
  source: DataSource | null
  asOf: number
}

export interface MarketsResponse {
  spot: SpotMarket[]
  perps: PerpMarket[]
  nodeOk: boolean
  source: DataSource
  asOf: number
}

export interface SwapQuote {
  from: ApiAsset
  to: ApiAsset
  amountIn: string
  amountOut: string
  unfilledIn: string
  fee: string
  /** `from` paid per `to` received. */
  executionPrice: string
  venue: string
  poolId: string | null
  priceImpact: string | null
  priceBefore: string | null
  priceAfter: string | null
  source: DataSource
  asOf: number
}

export interface AccountBalance {
  asset: ApiAsset
  balance: string
  /** Escrowed in resting spot orders. */
  inOrders: string
}

export interface AccountResponse {
  address: string
  balances: AccountBalance[]
  spotOrders: {
    market: string | null
    path: string | null
    pair: string
    orderId: string
    side: 'buy' | 'sell'
    price: string
    amount: string
    filled: string
    remaining: string
    base: ApiAsset
    quote: ApiAsset
  }[]
  lpPositions: LpPosition[]
  perp: PerpAccount | null
  exchangeNonce: number | null
  source: DataSource
  asOf: number
}

export interface ApiErrorBody {
  error: { code: string; message: string; candidates?: { address: string; symbol: string; name: string }[] }
}

/** exchange_getPositions (qrdx-node views.position_summary). */
export interface LpPosition {
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

/** perp_getAccount (qrdx-node views.account). */
export interface PerpAccount {
  address: string
  exchange_nonce: number
  collateral: string
  withdrawable: string
  equity: string
  maintenance_margin: string
  initial_margin: string
  open_order_margin: string
  positions: Record<
    string,
    {
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
  >
  leverage: Record<string, { leverage: string; mode: 'cross' | 'isolated' }>
  orders: {
    market_id: string
    order_id: string
    side: 'buy' | 'sell'
    price: string
    size: string
    filled: string
    remaining: string
    reduce_only: boolean
    leverage: string
  }[]
  vault_shares: string
  vault_unlock_time: string
  /** Token address, "QRDX" for native QRDX, or "" when the node has none configured. */
  collateral_token: string
}

/** A community token in the launch feed (GET /launches). */
export interface Launch {
  token: ApiAsset
  creator: string
  createdHeight: number
  totalSupply: string
  fixedSupply: boolean
  freezable: boolean
  market: {
    quote: ApiAsset
    path: string
    poolId: string
    feeRate: string
    /** Quote per token. */
    price: string | null
    marketCap: string | null
    marketCapUsd: string | null
    liquidity: string
    change24h: string | null
    volume24h: string | null
  } | null
}
