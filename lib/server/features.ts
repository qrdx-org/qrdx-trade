/**
 * What the network's node runs, and what the protocol charges on it, for the client to
 * offer only what will work: the trading features of qrdx-node's 2026-10 release
 * (docs/TRADING_FEATURES.md) arrive with a new genesis, so a network may not have them yet.
 */

import { cached } from './cache'
import { nowSec } from './http'
import type { Net } from './net'
import type { NodeFeatures } from './node'

export interface ProtocolCosts {
  /** QRDX burned to create a SUBSIDIZED pool, staked for a STANDARD one (EXCHANGE_POOL_*). */
  poolBurnSubsidized: string
  poolStakeStandard: string
  /** QRDX burned to list a perp market (PERP_MARKET_LISTING_FEE). */
  perpListingFee: string | null
  /** The exchange's gas price floor outside the free lane, wei (EXCHANGE_MIN_GAS_PRICE_WEI). */
  exchangeMinGasPriceWei: string | null
  /** Perps collateral a new market seeds its liquidity vault with, at least (PERP_MARKET_MIN_LIQUIDITY). */
  perpMinLiquidity: string | null
  /** A token perp's maximum leverage, at most and by default (PERP_SPOT_MAX_LEVERAGE). */
  perpSpotMaxLeverage: number | null
  /** What a token's pools must hold near the price to price its perp, in the settlement asset (SPOT_ORACLE_MIN_DEPTH). */
  spotOracleMinDepth: string | null
  /** The price history those pools need, and the oracle's TWAP window, seconds (SPOT_ORACLE_TWAP_SECONDS). */
  spotOracleTwapSeconds: number | null
  /** A token perp's open interest cap, as a multiple of its pools' depth (SPOT_OI_DEPTH_BPS / 10,000). */
  spotOiDepthMultiple: number | null
  /** Seconds the lister's seed liquidity stays locked (PERP_MARKET_LIQUIDITY_LOCKUP_SECONDS). */
  perpLiquidityLockupSeconds: number | null
  /** The least an order that opens or adds may be worth, in the quote (PERP_MIN_ORDER_VALUE). */
  perpMinOrderValue: string | null
  /**
   * QRDX an account keeps for fees (FEE_RESERVE_QRDX): nothing but fees takes it below
   * min(this, its balance as the block began) unless the transaction sets `spend_reserve`.
   * Null: the node has no reserve.
   */
  feeReserveQrdx: string | null
  /** The EVM's gas price floor, wei (EVM_MIN_GAS_PRICE_WEI). */
  evmMinGasPriceWei: string | null
  /** Seconds without an oracle update before a market's oracle is stale (PERP_ORACLE_STALE_SECONDS). */
  oracleStaleSeconds: number | null
}

export interface FeaturesResponse extends NodeFeatures {
  costs: ProtocolCosts
  source: 'node'
  asOf: number
}

export async function features(net: Net): Promise<FeaturesResponse> {
  return cached(net.key('features'), 60_000, async () => {
    const [f, spec] = await Promise.all([
      net.node.features().catch((): NodeFeatures => ({ trading: false, history: false })),
      net.node.chainSpec().catch(() => null),
    ])
    const param = (k: string) => (spec?.params?.[k] != null ? String(spec.params[k]) : null)
    const num = (k: string) => (param(k) === null || !Number.isFinite(Number(param(k))) ? null : Number(param(k)))
    const active = (feature: string) => !!spec?.active_features?.includes(feature)
    return {
      ...f,
      costs: {
        // Constants, not chain-spec parameters (qrdx-node constants.py), so they follow the
        // release: docs/TOKENOMICS.md cut them from 5,000 / 10,000 to 10 / 25 with these features.
        poolBurnSubsidized: f.trading ? '10' : '5000',
        poolStakeStandard: f.trading ? '25' : '10000',
        perpListingFee: param('PERP_MARKET_LISTING_FEE'),
        exchangeMinGasPriceWei: param('EXCHANGE_MIN_GAS_PRICE_WEI'),
        perpMinLiquidity: param('PERP_MARKET_MIN_LIQUIDITY'),
        perpSpotMaxLeverage: num('PERP_SPOT_MAX_LEVERAGE'),
        spotOracleMinDepth: param('SPOT_ORACLE_MIN_DEPTH'),
        spotOracleTwapSeconds: num('SPOT_ORACLE_TWAP_SECONDS'),
        spotOiDepthMultiple: num('SPOT_OI_DEPTH_BPS') === null ? null : num('SPOT_OI_DEPTH_BPS')! / 10_000,
        perpLiquidityLockupSeconds: num('PERP_MARKET_LIQUIDITY_LOCKUP_SECONDS'),
        perpMinOrderValue: param('PERP_MIN_ORDER_VALUE'),
        feeReserveQrdx: active('two_block_deferral') ? param('FEE_RESERVE_QRDX') : null,
        evmMinGasPriceWei: param('EVM_MIN_GAS_PRICE_WEI'),
        oracleStaleSeconds: num('PERP_ORACLE_STALE_SECONDS'),
      },
      source: 'node' as const,
      asOf: nowSec(),
    }
  })
}
