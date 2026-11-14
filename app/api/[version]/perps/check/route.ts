import { NATIVE_QRDX } from '@/lib/assets'
import { ApiError, handler, json, nowSec, options } from '@/lib/server/http'
import { apiAsset, perpCollateral } from '@/lib/server/markets'
import { netFromVersion } from '@/lib/server/net'
import type { NodePool } from '@/lib/server/node'
import { refForAddress, tokenIndex } from '@/lib/server/resolve'

const isQrdx = (a: string) => a.toUpperCase() === NATIVE_QRDX
const same = (a: string, b: string) => (isQrdx(a) ? isQrdx(b) : a.toLowerCase() === b.toLowerCase())
const live = (p: NodePool) => !p.paused && BigInt(p.liquidity || '0') > 0n

/**
 * Before listing a token perp (CREATE_MARKET {token}): does the token exist, does it have its
 * perp already, and does it have the pools the market would be priced from? A token perp reads
 * its token's own spot market: a pool against the settlement asset, or two through QRDX.
 * `GET /perps/check?token=0x…` (docs/API.md "Perpetuals"). The node alone judges the pools'
 * price history and depth, when the listing is signed.
 */
export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const raw = (new URL(req.url).searchParams.get('token') ?? '').trim()
  if (!isQrdx(raw) && !/^0x[0-9a-fA-F]{40}$/.test(raw)) throw new ApiError('bad_request', 'token must be a token address (0x…) or QRDX: a token perp names its token by address')
  const token = isQrdx(raw) ? NATIVE_QRDX : raw.toLowerCase()

  const [markets, idx, collateral] = await Promise.all([net.node.perpMarkets().catch(() => null), tokenIndex(net), perpCollateral(net)])
  const quote = markets?.[0]?.quote ?? 'USD'
  const marketId = `${token}-${quote}-PERP`
  const existing = markets?.find((m) => m.token != null && same(m.token, token))
  const known = isQrdx(token) || idx.byAddress.has(token)

  // The paths the node would read (qrdx-node handlers/perps.py _spot_paths).
  const pools = async (a: string, b: string) => (await net.node.pools(a, b).catch(() => [] as NodePool[])).filter(live)
  let direct: NodePool[] = []
  let viaQrdx: [NodePool[], NodePool[]] = [[], []]
  if (collateral && known && !same(token, collateral)) {
    direct = await pools(token, collateral)
    if (!isQrdx(token) && !isQrdx(collateral)) viaQrdx = await Promise.all([pools(token, NATIVE_QRDX), pools(NATIVE_QRDX, collateral)])
  }
  const twoHops = viaQrdx[0].length > 0 && viaQrdx[1].length > 0

  return json(
    {
      token,
      asset: known ? apiAsset(refForAddress(token, idx)) : null,
      quote,
      marketId: existing?.market_id ?? marketId,
      exists: !!existing,
      path: `/perps/${token.toLowerCase()}/${quote.toLowerCase()}`,
      nodeOk: markets !== null && idx.nodeOk,
      /** What perps settle in here (a token address, "QRDX", "" when none is configured). */
      collateral,
      collateralAsset: collateral ? apiAsset(refForAddress(collateral, idx)) : null,
      /** The settlement asset has no price in itself: the node refuses its perp. */
      isCollateral: !!collateral && same(token, collateral),
      spot: {
        route: direct.length ? 'direct' : twoHops ? 'qrdx' : null,
        pools: (direct.length ? direct : twoHops ? [...viaQrdx[0], ...viaQrdx[1]] : []).map((p) => ({ id: p.pool_id, token0: p.token0, token1: p.token1, feeRate: p.fee_rate })),
      },
      asOf: nowSec(),
    },
    10
  )
})
export const OPTIONS = options
