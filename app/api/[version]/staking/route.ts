import { cached } from '@/lib/server/cache'
import { handler, json, nowSec, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

/**
 * Staking on the network (qrdx-node docs/STAKING.md): every validator with its delegation
 * pool, the staking parameters, and the epoch clock (slot length, slots an epoch, the
 * epoch of the chain's head), so the page can say when warm-ups and unbonding end.
 */
export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const { version } = await params
  const net = netFromVersion(version)
  const body = await cached(net.key('staking'), 5_000, async () => {
    const [validators, pools, stakingParams, spec, status] = await Promise.all([
      net.node.stakingValidators(),
      net.node.stakingPools(),
      net.node.stakingParams(),
      net.node.chainSpec().catch(() => null),
      net.node.status().catch(() => null),
    ])
    const byValidator = new Map(pools.map((p) => [p.validator.toLowerCase(), p]))
    const slotMs = spec ? Number(spec.params.SLOT_DURATION_MS) : null
    const slotsPerEpoch = spec ? Number(spec.params.SLOTS_PER_EPOCH) : null
    // The head block's epoch: warm-ups and payouts are counted in epochs.
    let epoch: number | null = null
    if (status && status.height >= 0) {
      epoch = await net.node.blockEpoch(status.height).catch(() => null)
    }
    return {
      validators: validators.map((v) => {
        const pool = byValidator.get(v.address.toLowerCase()) ?? null
        return {
          ...v,
          pool,
          // An empty pool has no row yet: delegations open it at the default commission.
          commissionBps: pool ? pool.commission_bps : stakingParams.default_commission_bps,
        }
      }),
      params: stakingParams,
      clock: slotMs && slotsPerEpoch ? { slotMs, slotsPerEpoch, epochMs: slotMs * slotsPerEpoch } : null,
      height: status?.height ?? null,
      epoch,
    }
  })
  return json({ ...body, asOf: nowSec() }, 5)
})
export const OPTIONS = options
