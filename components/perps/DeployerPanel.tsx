'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccount } from '@/components/trade/SpotTradeView'
import { collateralLabel } from '@/components/trade/PerpOrderForm'
import { compact, fixed } from '@/lib/format'
import { isAmount } from '@/lib/decimal'
import { useApi } from '@/lib/hooks/useApi'
import { useFeatures } from '@/lib/hooks/useFeatures'
import type { PerpMarket } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

interface Deployer {
  address: string
  dex: string
  bond: string
  unbonding: string
  unlock: number | null
  markets: string[]
}

/**
 * Deployer markets (qrdx-node docs/HYPERLIQUID_PARITY.md 8, Hyperliquid's HIP-3): where
 * governance lists validator-priced markets, anyone may bond QRDX under a namespace and list
 * `namespace:ASSET` markets it prices itself. Its markets are isolated-margin only, its oracle
 * moves at most 1 % a second, the validators can freeze it, and governance can slash its bond.
 */
export function DeployerPanel() {
  const w = useWallet()
  const { apiBase } = useNet()
  const { costs } = useFeatures()
  const account = useAccount()
  const me = useApi<{ deployer: Deployer | null }>(w.trader ? `${apiBase}/deployers/${w.trader}` : null, 10_000)
  const perps = useApi<{ perps: PerpMarket[] }>(`${apiBase}/perps`, 10_000)
  const d = me.data?.deployer ?? null
  const minBond = Number(costs.deployerMinBond ?? 1250)
  const minLiquidity = Number(costs.perpMinLiquidity ?? 10000)
  const unit = collateralLabel(account.data)
  const free = account.data?.perp?.withdrawable ?? null

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>, ok = 'Submitted: it applies with the next block.') => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: ok })
      setTimeout(() => (me.refresh(), perps.refresh()), 2000)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  // Bonding
  const [dex, setDex] = useState('')
  const [bond, setBond] = useState(String(minBond))
  // Listing
  const [asset, setAsset] = useState('')
  const [oracle, setOracle] = useState('')
  const [lev, setLev] = useState('10')
  const [liquidity, setLiquidity] = useState(String(minLiquidity))
  const [feeShare, setFeeShare] = useState('20')

  const mine = (perps.data?.perps ?? []).filter((m) => d && m.id.startsWith(`${d.dex}:`))
  const listProblem = (() => {
    if (!d) return 'Bond first.'
    if (Number(d.bond) < minBond) return `List with at least ${minBond} QRDX bonded.`
    if (!/^[A-Za-z0-9]{1,12}$/.test(asset)) return 'The asset is 1–12 letters or digits.'
    if (!isAmount(oracle) || Number(oracle) <= 0) return 'Enter its starting price (USD).'
    if (!isAmount(liquidity) || Number(liquidity) < minLiquidity) return `Seed at least ${compact(minLiquidity)} ${unit} of liquidity.`
    if (free !== null && Number(liquidity) > Number(free)) return `You have ${fixed(free, 2)} ${unit} of free perps collateral.`
    if (!(Number(feeShare) >= 0 && Number(feeShare) <= 50)) return 'Your fee share is 0–50 %.'
    if (w.actingAs) return 'Switch the trading account to your own.'
    return null
  })()

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" /> List your own market
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This network lists validator-priced markets by governance. A <b>deployer</b> bonds {compact(minBond)} QRDX under a namespace and lists{' '}
          <span className="font-mono">namespace:ASSET</span> markets it prices itself: isolated margin only, its oracle moving at most 1 % a second,
          frozen by the validators if it misprices, and its bond slashed by governance.
        </p>

        {!d ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs text-muted-foreground">
              Namespace (1–8 lowercase letters and digits)
              <Input value={dex} onChange={(e) => setDex(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8))} placeholder="mydex" className="mt-1 h-9 font-mono" />
            </label>
            <label className="text-xs text-muted-foreground">
              Bond (QRDX)
              <Input value={bond} onChange={(e) => setBond(e.target.value.trim())} inputMode="decimal" className="num mt-1 h-9" />
            </label>
            <Button
              className="mt-5 h-9"
              disabled={!!busy || !/^[a-z][a-z0-9]{0,7}$/.test(dex) || !isAmount(bond) || Number(bond) < minBond}
              onClick={() => void run('bond', () => w.sendExchange({ op: 'DEPLOYER_BOND', params: { dex, amount: bond }, label: `Bond ${bond} QRDX as deployer ${dex}` }))}
            >
              {busy === 'bond' ? 'Confirm in wallet…' : 'Bond'}
            </Button>
            <p className="text-[11px] text-muted-foreground sm:col-span-3">The namespace is yours for good. Unbonding takes 14 days, and the bond stays slashable until then.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <Stat k="Namespace" v={d.dex} />
            <Stat k="Bonded" v={`${compact(d.bond)} QRDX`} />
            <Stat k="Markets" v={`${d.markets.length} of 10`} />
          </div>
        )}
      </div>

      {d && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">New market: {d.dex}:{asset.toUpperCase() || 'ASSET'}-USD-PERP</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Asset
              <Input value={asset} onChange={(e) => setAsset(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12))} placeholder="SOL" className="mt-1 h-9 uppercase" />
            </label>
            <label className="text-xs text-muted-foreground">
              Starting price (USD)
              <Input value={oracle} onChange={(e) => setOracle(e.target.value.trim())} inputMode="decimal" className="num mt-1 h-9" />
            </label>
            <label className="text-xs text-muted-foreground">
              Max leverage
              <Input value={lev} onChange={(e) => setLev(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="num mt-1 h-9" />
            </label>
            <label className="text-xs text-muted-foreground">
              Seed liquidity ({unit})
              <Input value={liquidity} onChange={(e) => setLiquidity(e.target.value.trim())} inputMode="decimal" className="num mt-1 h-9" />
            </label>
            <label className="text-xs text-muted-foreground">
              Your share of its fees (%)
              <Input value={feeShare} onChange={(e) => setFeeShare(e.target.value.trim())} inputMode="decimal" className="num mt-1 h-9" />
            </label>
            <div className="text-xs text-muted-foreground">
              Listing fee
              <div className="num mt-2 text-sm text-foreground">{costs.perpListingFee ?? '—'} QRDX, burned</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The seed goes into the market&apos;s liquidity vault, which the protocol quotes on its book; it stays locked for 30 days. Then keep its oracle
            fresh: a market without an update for {costs.oracleStaleSeconds ?? 300} s is stale (reduce-only, no funding).
          </p>
          <Button
            className="mt-3 w-full"
            disabled={!!listProblem || !!busy || !w.rightNetwork}
            onClick={() =>
              void run('list', () =>
                w.sendExchange({
                  op: 'CREATE_MARKET',
                  params: {
                    base_token: `${d.dex}:${asset.toUpperCase()}`,
                    oracle_price: oracle,
                    max_leverage: lev,
                    liquidity,
                    fee_share_bps: Math.round(Number(feeShare) * 100),
                  },
                  label: `List ${d.dex}:${asset.toUpperCase()}-USD-PERP at ${oracle}`,
                })
              )
            }
          >
            {busy === 'list' ? 'Confirm in wallet…' : (listProblem ?? `List ${d.dex}:${asset.toUpperCase()}-USD-PERP`)}
          </Button>
        </div>
      )}

      {d && mine.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">Your markets</h3>
          <div className="mt-2 space-y-2">
            {mine.map((m) => (
              <OracleRow key={m.id} market={m} busy={busy} run={run} />
            ))}
          </div>
        </div>
      )}
      {msg && <p className={cn('rounded-md px-3 py-2 text-sm', msg.ok ? 'bg-bid/10 text-bid' : 'bg-ask/10 text-ask')}>{msg.text}</p>}
    </div>
  )
}

function OracleRow({ market, busy, run }: { market: PerpMarket; busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const w = useWallet()
  const [price, setPrice] = useState('')
  const age = market.oracleTime ? Math.round(Date.now() / 1000 - market.oracleTime) : null
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Link href={market.path} className="min-w-40 font-medium hover:underline">
        {market.id}
      </Link>
      <span className="text-muted-foreground">
        oracle {market.oraclePrice ?? '—'}
        {age !== null && ` · ${age}s ago`}
      </span>
      <Input value={price} onChange={(e) => setPrice(e.target.value.trim())} placeholder="New oracle price" inputMode="decimal" className="num ml-auto h-8 w-36 text-xs" />
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        disabled={!!busy || !isAmount(price) || Number(price) <= 0}
        onClick={() => void run(`o:${market.id}`, () => w.sendExchange({ op: 'DEPLOYER_SET_ORACLE', params: { market_id: market.id, price }, label: `Set ${market.id} oracle to ${price}`, market: market.id }))}
      >
        {busy === `o:${market.id}` ? '…' : 'Set oracle'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 text-xs text-ask"
        disabled={!!busy}
        title="Settle every position at the oracle price and close the market for good"
        onClick={() => {
          if (window.confirm(`Halt ${market.id}? Every position settles at its oracle price and the market closes for good.`))
            void run(`h:${market.id}`, () => w.sendExchange({ op: 'DEPLOYER_HALT', params: { market_id: market.id }, label: `Halt ${market.id}`, market: market.id }))
        }}
      >
        Halt
      </Button>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] text-muted-foreground">{k}</div>
      <div className="num font-medium">{v}</div>
    </div>
  )
}
