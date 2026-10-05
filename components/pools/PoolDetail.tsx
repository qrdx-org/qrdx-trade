'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PairBadge } from '@/components/trade/TokenBadge'
import { useAccount } from '@/components/trade/SpotTradeView'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { dec, isAmount } from '@/lib/decimal'
import { fixed, price as fmtPrice, size as fmtSize } from '@/lib/format'
import { useApi, useDebounced } from '@/lib/hooks/useApi'
import type { ApiAsset, LpPosition } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

interface PoolDetailData {
  pool_id: string
  token0: string
  token1: string
  token0Asset: ApiAsset
  token1Asset: ApiAsset
  fee_rate: string
  tick_spacing: number
  price: string
  tick: number
  liquidity: string
  positions: number
  volume: [string, string]
  paused: boolean
  ticks: { tick: number; liquidity_net: string }[]
  twap?: { price: string | null }
}

// qrdx-node constants.py EXCHANGE_MIN_TICK / EXCHANGE_MAX_TICK; prices are 1.0001^tick.
const MIN_TICK = -887272
const MAX_TICK = 887272
const LOG_BASE = Math.log(1.0001)

const RANGES = [
  { id: '1', label: '±1%', pct: 0.01 },
  { id: '5', label: '±5%', pct: 0.05 },
  { id: '20', label: '±20%', pct: 0.2 },
  { id: 'full', label: 'Full range', pct: null },
] as const

/** Range around the current tick, on the pool's tick spacing (the node refuses anything else). */
export function rangeTicks(tick: number, spacing: number, pct: number | null): [number, number] {
  if (pct === null) return [Math.ceil(MIN_TICK / spacing) * spacing, Math.floor(MAX_TICK / spacing) * spacing]
  const lo = Math.floor((tick + Math.log(1 - pct) / LOG_BASE) / spacing) * spacing
  const hi = Math.ceil((tick + Math.log(1 + pct) / LOG_BASE) / spacing) * spacing
  return [Math.max(lo, Math.ceil(MIN_TICK / spacing) * spacing), Math.min(hi === lo ? lo + spacing : hi, Math.floor(MAX_TICK / spacing) * spacing)]
}

const tickPrice = (t: number) => Math.pow(1.0001, t)

export function PoolDetail({ poolId }: { poolId: string }) {
  const { apiBase } = useNet()
  const w = useWallet()
  const pool = useApi<PoolDetailData>(`${apiBase}/pools/${poolId}?twap=3600`, 10_000)
  const account = useAccount()
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('5')
  const [side, setSide] = useState<0 | 1>(0)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const p = pool.data
  const [lower, upper] = useMemo(
    () => (p ? rangeTicks(p.tick, p.tick_spacing, RANGES.find((r) => r.id === range)!.pct) : [0, 0]),
    [p, range]
  )
  const debounced = useDebounced(amount, 350)
  const quotePath =
    p && isAmount(debounced) && dec(debounced) > 0n
      ? `${apiBase}/quote/liquidity?pool=${poolId}&tickLower=${lower}&tickUpper=${upper}&amount${side}=${debounced}`
      : null
  const q = useApi<{ liquidity: string; amount0: string; amount1: string; in_range: boolean }>(quotePath)

  if (pool.error && !p) {
    return <p className="p-10 text-center text-sm text-muted-foreground">{pool.error.message}</p>
  }
  if (!p) return <p className="p-10 text-center text-sm text-muted-foreground">Loading pool…</p>

  const [t0, t1] = [p.token0Asset, p.token1Asset]
  const balance = (a: ApiAsset) => (a.address && account.data?.balances.find((b) => b.asset.address === a.address)?.balance) || '0'
  const mine = (account.data?.lpPositions ?? []).filter((x) => x.pool_id === poolId)

  const problem = (() => {
    if (p.paused) return 'This pool is paused.'
    if (!isAmount(amount) || dec(amount) <= 0n) return 'Enter an amount.'
    if (q.error) return q.error.message
    if (!q.data) return 'Getting a quote…'
    if (dec(q.data.liquidity) <= 0n) return 'That amount buys no liquidity in this range.'
    if (dec(q.data.amount0) > dec(balance(t0))) return `Not enough ${t0.symbol}.`
    if (dec(q.data.amount1) > dec(balance(t1))) return `Not enough ${t1.symbol}.`
    return null
  })()

  const send = async (key: string, op: string, params: Record<string, unknown>, label: string) => {
    setBusy(key)
    setMsg(null)
    try {
      await w.sendExchange({ op, params, label })
      setMsg({ ok: true, text: 'Submitted. It executes when the next block includes it (~3 min).' })
      if (op === 'ADD_LIQUIDITY') setAmount('')
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const ref = Number(p.price)
  const unit = `${t1.symbol} per ${t0.symbol}`

  return (
    <main className="mx-auto max-w-5xl px-3 py-6">
      <Link href="/pools" className="text-xs text-muted-foreground hover:underline">
        ← Pools
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <PairBadge base={t0} quote={t1} size="lg" />
        <h1 className="text-2xl font-semibold">
          {t0.symbol}/{t1.symbol}
        </h1>
        <span className="rounded border px-2 py-0.5 text-xs">{fixed(String(Number(p.fee_rate) * 100), 2)}% fee</span>
        {p.paused && <span className="text-xs text-amber-500">paused</span>}
      </div>
      {[t0, t1].filter((a) => !a.verified).map((a) => (
        <p key={a.segment} className="mt-2 text-xs text-amber-500">
          {a.symbol} is unverified: {a.address}
        </p>
      ))}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Box k={`Price (${unit})`} v={fmtPrice(p.price, ref)} />
        <Box k="1h TWAP" v={p.twap?.price ? fmtPrice(p.twap.price, ref) : '—'} />
        <Box k="Active liquidity" v={fixed(p.liquidity, 2)} />
        <Box k="Volume (all time)" v={`${fmtSize(p.volume[0])} ${t0.symbol}`} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_340px]">
        <section>
          <h2 className="text-sm font-medium">Your positions</h2>
          {!w.trader ? (
            <p className="mt-2 text-xs text-muted-foreground">Connect the QRDX Wallet to see your positions.</p>
          ) : mine.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No positions in this pool.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {mine.map((pos) => (
                <PositionCard
                  key={pos.position_id}
                  pos={pos}
                  t0={t0}
                  t1={t1}
                  busy={busy}
                  onCollect={() => send(`c${pos.position_id}`, 'REMOVE_LIQUIDITY', { pool_id: poolId, position_id: pos.position_id, amount: '0' }, `Collect fees from ${t0.symbol}/${t1.symbol}`)}
                  onRemove={() => send(`r${pos.position_id}`, 'REMOVE_LIQUIDITY', { pool_id: poolId, position_id: pos.position_id }, `Remove ${t0.symbol}/${t1.symbol} position`)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-medium">Add liquidity</h2>
          <div className="mt-3 grid grid-cols-4 gap-1">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} className={cn('rounded border py-1 text-xs', range === r.id ? 'border-primary bg-accent' : 'text-muted-foreground')}>
                {r.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground tabular">
            {fmtPrice(String(tickPrice(lower)), ref)} – {range === 'full' ? '∞' : fmtPrice(String(tickPrice(upper)), ref)} {unit}
            <span className="block">Ticks {lower} to {upper}</span>
          </p>
          <div className="mt-3 flex gap-1 text-xs">
            {([0, 1] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)} className={cn('rounded px-2 py-0.5', side === s ? 'bg-accent' : 'text-muted-foreground')}>
                Deposit by {(s === 0 ? t0 : t1).symbol}
              </button>
            ))}
          </div>
          <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} placeholder={`${(side === 0 ? t0 : t1).symbol} amount`} className="mt-2 h-9 text-right tabular" />
          <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
            <Line k={`${t0.symbol} deposit`} v={q.data ? fmtSize(q.data.amount0) : '—'} sub={w.trader ? `bal ${fmtSize(balance(t0))}` : undefined} />
            <Line k={`${t1.symbol} deposit`} v={q.data ? fmtSize(q.data.amount1) : '—'} sub={w.trader ? `bal ${fmtSize(balance(t1))}` : undefined} />
            <Line k="Liquidity" v={q.data ? fixed(q.data.liquidity, 4) : '—'} />
            {q.data && !q.data.in_range && <p className="text-amber-500">The price is outside this range: it earns no fees until the price moves into it.</p>}
          </div>
          <div className="mt-3">
            {!w.trader ? (
              <ConnectButton className="w-full" />
            ) : (
              <Button
                className="w-full"
                disabled={!!problem || busy !== null || !w.rightNetwork}
                onClick={() =>
                  send('add', 'ADD_LIQUIDITY', { pool_id: poolId, tick_lower: lower, tick_upper: upper, amount: q.data!.liquidity }, `Add liquidity to ${t0.symbol}/${t1.symbol}`)
                }
              >
                {busy === 'add' ? 'Confirm in wallet…' : problem && problem !== 'Getting a quote…' ? problem : 'Add liquidity'}
              </Button>
            )}
          </div>
          {msg && <p className={cn('mt-2 text-xs', msg.ok ? 'text-bid' : 'text-ask')}>{msg.text}</p>}
          <p className="mt-2 text-[10px] text-muted-foreground">
            The deposit is what the node charges if the price has not moved when the block executes. The receipt carries the
            position id.
          </p>
        </section>
      </div>
    </main>
  )
}

function PositionCard({
  pos,
  t0,
  t1,
  busy,
  onCollect,
  onRemove,
}: {
  pos: LpPosition
  t0: ApiAsset
  t1: ApiAsset
  busy: string | null
  onCollect: () => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border p-3 text-xs tabular">
      <div className="flex items-center justify-between">
        <span className="font-mono text-muted-foreground">{pos.position_id.slice(0, 12)}</span>
        <span className={pos.in_range ? 'text-bid' : 'text-amber-500'}>{pos.in_range ? 'In range' : 'Out of range'}</span>
      </div>
      <div className="mt-1">
        Range {fmtPrice(pos.price_lower)} – {fmtPrice(pos.price_upper)} {t1.symbol}/{t0.symbol}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <span>
          {fmtSize(pos.amount0)} {t0.symbol} + {fmtSize(pos.amount1)} {t1.symbol}
        </span>
        <span className="text-right text-bid">
          fees {fmtSize(pos.fees0)} {t0.symbol} + {fmtSize(pos.fees1)} {t1.symbol}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null} onClick={onCollect}>
          Collect fees
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null} onClick={onRemove}>
          Remove all
        </Button>
      </div>
    </div>
  )
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="mt-0.5 text-sm tabular">{v}</div>
    </div>
  )
}

function Line({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular">
        {v}
        {sub && <span className="ml-2 text-muted-foreground">{sub}</span>}
      </span>
    </div>
  )
}
