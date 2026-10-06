'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TokenPicker } from '@/components/swap/SwapCard'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { dec, isAmount } from '@/lib/decimal'
import { fixed } from '@/lib/format'
import { apiGet, useApi } from '@/lib/hooks/useApi'
import { FEE_TIERS, POOL_TYPES, PoolType, canonicalInitialPrice } from '@/lib/launch'
import type { ApiAsset } from '@/lib/types'
import type { PoolRow } from '@/components/pools/PoolsList'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

type AssetList = { assets: ApiAsset[]; tokens?: ApiAsset[] }

/**
 * Create a pool for any two tokens (CREATE_POOL). Creating a pool also creates
 * the pair's order book. Liquidity is added afterwards, from the pool's page.
 */
export function CreatePool() {
  const w = useWallet()
  const { apiBase } = useNet()
  const params = useSearchParams()
  const list = useApi<AssetList>(`${apiBase}/assets?all=1`, 60_000)
  const all = useMemo(() => [...(list.data?.assets ?? []), ...(list.data?.tokens ?? [])].filter((a) => a.listed), [list.data])

  const [a, setA] = useState<string>((params.get('token') ?? '').toLowerCase())
  const [b, setB] = useState<string>('qrdx')
  const [picking, setPicking] = useState<'a' | 'b' | null>(null)
  const [feeTier, setFeeTier] = useState<number>(3000)
  const [poolType, setPoolType] = useState<PoolType>('STANDARD')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [tx, setTx] = useState<string | null>(null)
  const [poolId, setPoolId] = useState<string | null>(null)

  const find = (seg: string) => all.find((x) => x.segment === seg || x.address === seg) ?? null
  const A = find(a)
  const B = find(b)
  const existing = useApi<{ pools: PoolRow[] }>(A && B && A.segment !== B.segment ? `${apiBase}/pools?base=${A.segment}&quote=${B.segment}` : null)
  const taken = (existing.data?.pools ?? []).some((p) => p.feeTier === feeTier)
  const cost = POOL_TYPES.find((p) => p.type === poolType)!

  // Wait for the pool's receipt to learn its id.
  useEffect(() => {
    if (!tx || poolId) return
    const id = setInterval(async () => {
      const r = await apiGet<{ success: boolean; error: string; data: { pool_id?: string } }>(`${apiBase}/receipts/${tx}`).catch(() => null)
      if (!r) return
      clearInterval(id)
      if (r.data.success) setPoolId(String(r.data.data.pool_id))
      else setMsg({ ok: false, text: `Creating the pool failed: ${r.data.error}` })
    }, 4000)
    return () => clearInterval(id)
  }, [tx, poolId, apiBase])

  const problem = (() => {
    if (!A || !B) return 'Choose two tokens.'
    if (A.segment === B.segment) return 'Choose two different tokens.'
    if (taken) return 'A pool with this fee tier already exists for the pair.'
    if (!isAmount(price) || dec(price) <= 0n) return `Enter the starting price of 1 ${A.symbol} in ${B.symbol}.`
    return null
  })()

  const submit = async () => {
    if (problem || !A?.address || !B?.address) return
    setBusy(true)
    setMsg(null)
    try {
      const [token0, token1] = A.address < B.address ? [A.address, B.address] : [B.address, A.address]
      const res = await w.sendExchange({
        op: 'CREATE_POOL',
        params: {
          token0,
          token1,
          fee_tier: feeTier,
          pool_type: poolType,
          initial_price: canonicalInitialPrice(A.address, B.address, price),
          stake_amount: cost.qrdx,
        },
        label: `Create ${A.symbol}/${B.symbol} pool (${FEE_TIERS.find((f) => f.tier === feeTier)?.rate})`,
      })
      setTx(res.txHash)
      setMsg({ ok: true, text: 'Submitted. The pool exists once the next block includes it (~3 min).' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto mt-8 w-full max-w-md px-3">
      <Link href="/pools" className="text-xs text-muted-foreground hover:underline">
        ← Pools
      </Link>
      <section className="mt-2 rounded-xl border bg-card p-4">
        <h1 className="text-lg font-semibold">New pool</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Creates the pool and the pair&apos;s order book. Add liquidity from the pool&apos;s page once it exists. To launch a
          new coin with a market in one go, use <Link href="/launch" className="underline">Launch</Link>.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              ['a', A],
              ['b', B],
            ] as const
          ).map(([k, asset]) => (
            <button key={k} onClick={() => setPicking(k)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
              <TokenBadge asset={asset} size="sm" />
              <span className="truncate">{asset?.symbol ?? 'Select token'}</span>
              <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
        {[A, B].filter((x) => x && !x.verified).map((x) => (
          <p key={x!.segment} className="mt-1 text-[11px] text-warn">
            {x!.symbol} is unverified: {x!.address}
          </p>
        ))}

        <div className="mt-4 text-xs text-muted-foreground">Fee tier</div>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {FEE_TIERS.map((f) => {
            const exists = (existing.data?.pools ?? []).some((p) => p.feeTier === f.tier)
            return (
              <button key={f.tier} onClick={() => setFeeTier(f.tier)} className={cn('rounded border py-1 text-xs', feeTier === f.tier ? 'border-primary bg-accent' : 'text-muted-foreground', exists && 'line-through')} title={exists ? 'Already exists' : undefined}>
                {f.rate}
              </button>
            )
          })}
        </div>

        <label className="mt-4 block">
          <span className="text-xs text-muted-foreground">Starting price: 1 {A?.symbol ?? 'A'} =</span>
          <div className="mt-1 flex items-center gap-2">
            <Input value={price} onChange={(e) => setPrice(e.target.value.trim())} inputMode="decimal" className="tabular" />
            <span className="text-sm">{B?.symbol ?? 'B'}</span>
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Set it carefully: the first liquidity is added at this price, and arbitrage corrects a wrong one at the first
            provider&apos;s expense.
          </span>
        </label>

        <div className="mt-4 text-xs text-muted-foreground">Pool cost</div>
        <div className="mt-1 space-y-1">
          {POOL_TYPES.map((p) => (
            <label key={p.type} className={cn('flex cursor-pointer gap-2 rounded border p-2 text-xs', poolType === p.type && 'border-primary bg-accent/50')}>
              <input type="radio" checked={poolType === p.type} onChange={() => setPoolType(p.type)} />
              <span>
                <b>{p.label}</b>
                <span className="block text-muted-foreground">{p.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4">
          {!w.trader ? (
            <ConnectButton className="w-full" />
          ) : poolId ? (
            <Button className="w-full" asChild>
              <Link href={`/pools/${poolId}`}>Add liquidity to the new pool</Link>
            </Button>
          ) : (
            <Button className="w-full" disabled={!!problem || busy || !!tx || !w.rightNetwork} onClick={submit}>
              {busy ? 'Confirm in wallet…' : tx ? 'Waiting for the block…' : problem ?? `Create pool · ${fixed(cost.qrdx, 0)} QRDX`}
            </Button>
          )}
        </div>
        {msg && <p className={cn('mt-2 text-xs', msg.ok ? 'text-bid' : 'text-ask')}>{msg.text}</p>}
      </section>

      <TokenPicker
        open={picking !== null}
        assets={all}
        onClose={() => setPicking(null)}
        onPick={(x) => {
          if (picking === 'a') setA(x.segment)
          else setB(x.segment)
          setPicking(null)
        }}
      />
    </main>
  )
}
