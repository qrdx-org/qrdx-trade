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
  /** Anyone may list a validator-priced perp market (PERP_OPEN_LISTING); else governance lists them. */
  perpOpenListing: boolean | null
  /** Perps collateral a new market seeds its liquidity vault with, at least (PERP_MARKET_MIN_LIQUIDITY). */
  perpMinLiquidity: string | null
  /** QRDX a deployer bonds to list its own markets (DEPLOYER_MIN_BOND). */
  deployerMinBond: string | null
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
    return {
      ...f,
      costs: {
        // Constants, not chain-spec parameters (qrdx-node constants.py), so they follow the
        // release: docs/TOKENOMICS.md cut them from 5,000 / 10,000 to 10 / 25 with these features.
        poolBurnSubsidized: f.trading ? '10' : '5000',
        poolStakeStandard: f.trading ? '25' : '10000',
        perpListingFee: param('PERP_MARKET_LISTING_FEE'),
        exchangeMinGasPriceWei: param('EXCHANGE_MIN_GAS_PRICE_WEI'),
        perpOpenListing: param('PERP_OPEN_LISTING') === null ? null : param('PERP_OPEN_LISTING') !== '0',
        perpMinLiquidity: param('PERP_MARKET_MIN_LIQUIDITY'),
        deployerMinBond: param('DEPLOYER_MIN_BOND'),
        oracleStaleSeconds: param('PERP_ORACLE_STALE_SECONDS') === null ? null : Number(param('PERP_ORACLE_STALE_SECONDS')),
      },
      source: 'node' as const,
      asOf: nowSec(),
    }
  })
}
