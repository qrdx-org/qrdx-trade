/**
 * Per-trader reads (balances, resting orders, LP positions, perps account),
 * pools, and swap / liquidity quotes.
 */

import { VERIFIED_ASSETS, isNativeAsset, isTokenAddress, marketPath, preferredOrder } from '../assets'
import { S, dec, mul, str } from '../decimal'
import { isInverted, orientPrice } from '../pairs'
import type { AccountResponse, ApiAsset, SwapQuote } from '../types'
import { ApiError, nowSec } from './http'
import { apiAsset } from './markets'
import type { Net } from './net'
import type { NodeSpotOrder } from './node'
import { refForAddress, resolveSegment, tokenIndex } from './resolve'
import { mapLimit } from './util'

const PQ_ADDRESS_RE = /^0xPQ[0-9a-fA-F]{64}$/
/** Tokens checked per account read, newest first (plus verified, requested, and in-use ones). */
const MAX_SCANNED_TOKENS = 300
const BALANCE_CONCURRENCY = 16

export function checkTraderAddress(address: string): void {
  // Exchange operations are signed by the PQ key; accounts are keyed by the 0xPQ address.
  if (!PQ_ADDRESS_RE.test(address) && !isTokenAddress(address)) {
    throw new ApiError('bad_request', 'Expected a 0xPQ… address (or a 0x… account)')
  }
}

export async function account(net: Net, address: string, extraTokens: string[]): Promise<AccountResponse> {
  checkTraderAddress(address)
  const { node } = net
  const idx = await tokenIndex(net)
  if (!idx.nodeOk) throw new ApiError('node_unavailable', 'QRDX node unreachable')

  // Every native token the node knows, so unverified coins (launches, pools against
  // them) show up too: the node has no "all balances of an address" read, and its
  // HTTP endpoint refuses JSON-RPC batches, so this is one call per token, bounded.
  const tokens = new Set<string>()
  for (const a of VERIFIED_ASSETS) {
    const t = idx.verified.get(a.slug)
    if (t) tokens.add(t.token_address.toLowerCase())
  }
  for (const t of extraTokens) if (isTokenAddress(t)) tokens.add(t.toLowerCase())
  const newest = [...idx.byAddress.values()].sort((a, b) => b.created_height - a.created_height).slice(0, MAX_SCANNED_TOKENS)
  for (const t of newest) tokens.add(t.token_address.toLowerCase())

  const [orders, positions, perp, nonce] = await Promise.all([
    node.spotOrders(address),
    node.positions(address).catch(() => []),
    node.perpAccount(address).catch(() => null),
    node.nonce(address).catch(() => null),
  ])
  for (const o of orders) for (const t of o.pair.split(':')) tokens.add(t.toLowerCase())
  for (const p of positions) for (const t of [p.token0, p.token1]) tokens.add(t.toLowerCase())

  const balances = await mapLimit([...tokens], BALANCE_CONCURRENCY, async (t) => ({
    t,
    // The node may write small balances in exponent form ("2.82E-16"); clients expect plain decimals.
    // Native QRDX is the account's own balance (eth_getBalance), not a token-ledger entry.
    balance: str(dec(await (isNativeAsset(t) ? node.nativeBalance(address) : node.tokenBalance(t, address)).catch(() => '0'))),
  }))

  // Funds escrowed by resting orders: buys hold quote (token1) at their price, sells hold base.
  const escrow = new Map<string, bigint>()
  const addEscrow = (t: string, amt: bigint) => escrow.set(t, (escrow.get(t) ?? 0n) + amt)
  for (const o of orders) {
    const [t0, t1] = o.pair.toLowerCase().split(':')
    if (o.side === 'buy') addEscrow(t1, mul(dec(o.remaining), dec(o.price)))
    else addEscrow(t0, dec(o.remaining))
  }

  return {
    address,
    balances: balances
      .map(({ t, balance }) => ({
        asset: apiAsset(refForAddress(t, idx)),
        balance,
        inOrders: str(escrow.get(t) ?? 0n),
      }))
      .filter((b) => !S.isZero(b.balance) || !S.isZero(b.inOrders) || b.asset.verified)
      .sort((a, b) => Number(b.asset.verified) - Number(a.asset.verified) || a.asset.symbol.localeCompare(b.asset.symbol)),
    spotOrders: orders.map((o) => orientOrder(o, idx)),
    lpPositions: positions,
    perp,
    exchangeNonce: nonce,
    source: 'node',
    asOf: nowSec(),
  }
}

function orientOrder(o: NodeSpotOrder, idx: Awaited<ReturnType<typeof tokenIndex>>) {
  const [t0, t1] = o.pair.toLowerCase().split(':')
  const [base, quote] = preferredOrder(refForAddress(t0, idx), refForAddress(t1, idx))
  const inverted = isInverted(base.address!, t0)
  return {
    market: `${base.segment}/${quote.segment}`,
    path: marketPath('spot', base.segment, quote.segment),
    pair: o.pair,
    orderId: o.order_id,
    side: (inverted ? (o.side === 'buy' ? 'sell' : 'buy') : o.side) as 'buy' | 'sell',
    price: orientPrice(o.price, inverted) ?? o.price,
    amount: inverted ? str(mul(dec(o.amount), dec(o.price))) : o.amount,
    filled: inverted ? str(mul(dec(o.filled), dec(o.price))) : o.filled,
    remaining: inverted ? str(mul(dec(o.remaining), dec(o.price))) : o.remaining,
    base: apiAsset(base),
    quote: apiAsset(quote),
  }
}

// ─── Pools ─────────────────────────────────────────────────────────────────────

export async function pools(net: Net, baseSeg?: string, quoteSeg?: string) {
  const { node } = net
  const idx = await tokenIndex(net)
  let list
  if (baseSeg && quoteSeg) {
    const [b, q] = await Promise.all([resolveSegment(net, baseSeg), resolveSegment(net, quoteSeg)])
    if (!b.ref.address || !q.ref.address) return { pools: [], source: 'node', asOf: nowSec() }
    list = await node.pools(b.ref.address, q.ref.address)
  } else {
    list = await node.pools()
  }
  return {
    pools: list.map((p) => {
      const t0 = refForAddress(p.token0, idx)
      const t1 = refForAddress(p.token1, idx)
      const [base, quote] = preferredOrder(t0, t1)
      const inverted = isInverted(base.address!, p.token0)
      return {
        poolId: p.pool_id,
        token0: apiAsset(t0),
        token1: apiAsset(t1),
        market: { base: apiAsset(base), quote: apiAsset(quote), path: marketPath('spot', base.segment, quote.segment) },
        feeTier: p.fee_tier,
        feeRate: p.fee_rate,
        tickSpacing: p.tick_spacing,
        poolType: p.pool_type,
        /** token1 per token0, as the node reports. */
        price: p.price,
        /** quote per base of `market`. */
        marketPrice: orientPrice(p.price, inverted),
        tick: p.tick,
        liquidity: p.liquidity,
        positions: p.positions,
        volume: p.volume,
        protocolFees: p.protocol_fees,
        paused: p.paused,
        holderAddress: p.holder_address,
        creator: p.creator,
      }
    }),
    source: 'node' as const,
    asOf: nowSec(),
  }
}

export async function pool(net: Net, poolId: string, twap?: number) {
  const p = await net.node.pool(poolId, twap)
  if (!p) throw new ApiError('not_found', `No pool ${poolId}`)
  const idx = await tokenIndex(net)
  return { ...p, token0Asset: apiAsset(refForAddress(p.token0, idx)), token1Asset: apiAsset(refForAddress(p.token1, idx)), source: 'node', asOf: nowSec() }
}

// ─── Quotes ────────────────────────────────────────────────────────────────────

export async function swapQuote(
  net: Net,
  fromSeg: string,
  toSeg: string,
  amount: string,
  sender: string,
  venue: string,
  poolId?: string
): Promise<SwapQuote> {
  if (!/^\d+(\.\d+)?$/.test(amount) || dec(amount) <= 0n) throw new ApiError('bad_request', 'amount must be a positive decimal')
  if (!['auto', 'amm', 'clob'].includes(venue)) throw new ApiError('bad_request', 'venue must be auto, amm or clob')
  const [from, to] = await Promise.all([resolveSegment(net, fromSeg), resolveSegment(net, toSeg)])
  if (!from.ref.address || !to.ref.address) {
    throw new ApiError('not_found', `${!from.ref.address ? from.ref.symbol : to.ref.symbol} has no token on this network yet`)
  }
  const q = await net.node.quoteSwap(from.ref.address, to.ref.address, amount, sender, poolId, venue)
  if (!q) throw new ApiError('not_found', 'No liquidity for this swap')
  const asset = (r: typeof from.ref): ApiAsset => apiAsset(r)
  return {
    from: asset(from.ref),
    to: asset(to.ref),
    amountIn: q.amount_in,
    amountOut: q.amount_out,
    unfilledIn: q.unfilled_in,
    fee: q.fee,
    executionPrice: q.execution_price,
    venue: q.source,
    poolId: q.pool_id,
    priceImpact: q.price_impact ?? null,
    priceBefore: q.price_before ?? null,
    priceAfter: q.price_after ?? null,
    source: 'node',
    asOf: nowSec(),
  }
}

export async function liquidityQuote(
  net: Net,
  poolId: string,
  tickLower: number,
  tickUpper: number,
  amounts: { liquidity?: string; amount0?: string; amount1?: string }
) {
  const q = await net.node.quoteLiquidity(poolId, tickLower, tickUpper, amounts)
  if (!q) throw new ApiError('not_found', `No pool ${poolId}`)
  return { ...q, source: 'node', asOf: nowSec() }
}

