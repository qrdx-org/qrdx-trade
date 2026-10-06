/**
 * The launch feed: the newest community tokens (anything that is not a
 * verified asset), with the market each one trades on.
 *
 * A token's market is its deepest pool against a verified asset (QRDX, USDC, …).
 * Market cap is price × total supply in that quote, and in USD when the quote
 * has an index price. Supply safety comes straight from the token registry: no
 * mint authority means the supply can never grow, no freeze authority means no
 * one can lock a holder's balance.
 */

import { marketPath } from '../assets'
import { dec, mul, str } from '../decimal'
import { isInverted, orientPrice } from '../pairs'
import type { Launch } from '../types'
import { cached } from './cache'
import { nowSec } from './http'
import { apiAsset, historyMarketStats } from './markets'
import { poolStats } from './history'
import { usdQuotes } from './usd'
import type { Net } from './net'
import type { NodePool } from './node'
import { refForAddress, tokenIndex } from './resolve'

export async function launches(net: Net, limit: number): Promise<{ launches: Launch[]; height: number | null; source: 'node'; asOf: number }> {
  const [idx, pools] = await Promise.all([
    tokenIndex(net),
    cached(net.key('pools'), 2_000, () => net.node.pools()).catch(() => [] as NodePool[]),
  ])
  const community = [...idx.byAddress.values()]
    .filter((t) => !idx.slugByAddress.has(t.token_address.toLowerCase()))
    .sort((a, b) => b.created_height - a.created_height)
    .slice(0, limit)

  // Each coin's market: its deepest unpaused pool against a verified asset.
  const markets = new Map<string, { p: NodePool; quote: ReturnType<typeof refForAddress> }>()
  for (const t of community) {
    const addr = t.token_address.toLowerCase()
    const best = pools
      .filter((p) => !p.paused && [p.token0.toLowerCase(), p.token1.toLowerCase()].includes(addr))
      .map((p) => ({ p, quote: refForAddress(p.token0.toLowerCase() === addr ? p.token1.toLowerCase() : p.token0.toLowerCase(), idx) }))
      .filter((c) => c.quote.verified)
      .sort((a, b) => {
        const d = dec(b.p.liquidity) - dec(a.p.liquidity)
        return d > 0n ? 1 : d < 0n ? -1 : b.p.positions - a.p.positions
      })[0]
    if (best) markets.set(addr, best)
  }
  const [history, usd] = await Promise.all([
    poolStats(net, [...markets.values()].map((m) => m.p.pool_id)),
    usdQuotes(net).catch(() => new Map()),
  ])

  const out = community.map((t): Launch => {
    const addr = t.token_address.toLowerCase()
    const token = apiAsset(refForAddress(addr, idx))
    const best = markets.get(addr)
    let market: Launch['market'] = null
    if (best) {
      const inverted = isInverted(addr, best.p.token0.toLowerCase())
      const price = orientPrice(best.p.price, inverted)
      const marketCap = price ? str(mul(dec(price), dec(t.total_supply))) : null
      const tokenUsd = usd.get(addr)
      market = {
        quote: apiAsset(best.quote),
        path: marketPath('spot', addr, best.quote.segment),
        poolId: best.p.pool_id,
        feeRate: best.p.fee_rate,
        price,
        marketCap,
        marketCapUsd: tokenUsd ? str(mul(dec(tokenUsd.price), dec(t.total_supply))) : null,
        priceUsd: tokenUsd?.price ?? null,
        liquidity: best.p.liquidity,
        ...historyMarketStats(history[best.p.pool_id], inverted),
      }
    }
    return {
      token,
      creator: t.creator,
      createdHeight: t.created_height,
      totalSupply: t.total_supply,
      fixedSupply: t.mint_authority === null,
      freezable: t.freeze_authority !== null,
      market,
    }
  })
  const height = await net.node.height().catch(() => null)
  return { launches: out, height, source: 'node', asOf: nowSec() }
}
