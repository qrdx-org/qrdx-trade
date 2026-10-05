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

import { marketPath, verifiedBySlug } from '../assets'
import { dec, mul, str } from '../decimal'
import { canonicalPair, isInverted, orientPrice } from '../pairs'
import type { Launch } from '../types'
import { cached } from './cache'
import { nowSec } from './http'
import { pairTrades } from './indexer'
import { apiAsset, stats24h } from './markets'
import type { Net } from './net'
import type { NodePool } from './node'
import { indexTicker } from './reference'
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

  const out = await Promise.all(
    community.map(async (t): Promise<Launch> => {
      const addr = t.token_address.toLowerCase()
      const token = apiAsset(refForAddress(addr, idx))
      // Pools against a verified asset, deepest first.
      const candidates = pools
        .filter((p) => !p.paused && [p.token0.toLowerCase(), p.token1.toLowerCase()].includes(addr))
        .map((p) => {
          const other = p.token0.toLowerCase() === addr ? p.token1.toLowerCase() : p.token0.toLowerCase()
          return { p, quote: refForAddress(other, idx) }
        })
        .filter((c) => c.quote.verified)
        .sort((a, b) => (dec(b.p.liquidity) > dec(a.p.liquidity) ? 1 : -1))
      const best = candidates[0]
      let market: Launch['market'] = null
      if (best) {
        const inverted = isInverted(addr, best.p.token0.toLowerCase())
        const { pair } = canonicalPair(best.p.token0.toLowerCase(), best.p.token1.toLowerCase())
        const history = await pairTrades(net, pair).catch(() => ({ trades: [] }))
        const trades = history.trades.map((x) =>
          inverted
            ? { time: x.time, price: orientPrice(x.price, true) ?? '0', size: x.quoteSize }
            : { time: x.time, price: x.price, size: x.size }
        )
        const s = stats24h(trades)
        const price = s.last ?? orientPrice(best.p.price, inverted)
        const marketCap = price ? str(mul(dec(price), dec(t.total_supply))) : null
        const quoteAsset = best.quote.slug ? verifiedBySlug(best.quote.slug) : undefined
        const quoteUsd = quoteAsset ? await indexTicker(quoteAsset).catch(() => null) : null
        market = {
          quote: apiAsset(best.quote),
          path: marketPath('spot', addr, best.quote.segment),
          poolId: best.p.pool_id,
          feeRate: best.p.fee_rate,
          price,
          marketCap,
          marketCapUsd: marketCap && quoteUsd ? str(mul(dec(marketCap), dec(quoteUsd.price))) : null,
          liquidity: best.p.liquidity,
          change24h: s.change24h,
          volume24h: s.volume24h,
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
  )
  const height = await net.node.height().catch(() => null)
  return { launches: out, height, source: 'node', asOf: nowSec() }
}
