'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Vault as VaultIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useAccount } from '@/components/trade/SpotTradeView'
import { collateralLabel } from '@/components/trade/PerpOrderForm'
import { fixed, compact, timeAgo } from '@/lib/format'
import { isAmount } from '@/lib/decimal'
import { useApi } from '@/lib/hooks/useApi'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

export interface VaultRow {
  vault: string
  leader: string
  name: string
  profitShare: string
  created: number
  marketMakerFor: string | null
  nav: string
  totalShares: string
  shareValue: string | null
  leaderShares: string
  holders: number
  withdrawable: string
  lockupSeconds: number
  positions: Record<string, { size: string; entry_price: string }>
  holding: { shares: string; cost: string; value: string; unlock: string } | null
}

export const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`

/**
 * User vaults (copy trading, qrdx-node docs/TRADING_FEATURES.md §9): a leader trades a margin
 * account others deposit into for shares at NAV, and takes a share of their gains. Markets'
 * liquidity vaults are the same kind of account, quoted on their book by the protocol.
 */
export function VaultsView() {
  const { apiBase } = useNet()
  const { trading, known } = useFeatures()
  const list = useApi<{ vaults: VaultRow[] }>(trading ? `${apiBase}/vaults` : null, 15_000)
  const rows = list.data?.vaults ?? []
  const user = rows.filter((v) => !v.marketMakerFor)
  const makers = rows.filter((v) => v.marketMakerFor)
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
        <VaultIcon className="h-7 w-7 text-muted-foreground" /> Vaults
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
        Deposit perps collateral with a trader for shares at the vault&apos;s value. The leader trades it and keeps a share of what depositors gain; deposits are locked for a day. A leader can lose your deposit by trading, within a protocol band of 10 % from the mark per order.
      </p>
      {known && !trading ? (
        <p className="mt-8 rounded-lg border p-6 text-center text-sm text-muted-foreground">This network&apos;s node has no user vaults yet.</p>
      ) : (
        <>
          <VaultTable rows={user} empty="No vaults yet: start one below." />
          {makers.length > 0 && (
            <>
              <h2 className="mt-8 text-sm font-semibold">Market liquidity vaults</h2>
              <p className="text-xs text-muted-foreground">Each quotes its market&apos;s book for the protocol. Anyone may add liquidity at its value and share its PnL and fees.</p>
              <VaultTable rows={makers} empty="" />
            </>
          )}
          <CreateVault />
        </>
      )}
    </main>
  )
}

function VaultTable({ rows, empty }: { rows: VaultRow[]; empty: string }) {
  if (!rows.length) return empty ? <p className="mt-6 rounded-lg border p-6 text-center text-sm text-muted-foreground">{empty}</p> : null
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
      <table className="num w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="text-right">
            <th className="px-4 py-2 text-left font-medium">Vault</th>
            <th className="px-4 py-2 font-medium">Value</th>
            <th className="px-4 py-2 font-medium">Share value</th>
            <th className="px-4 py-2 font-medium">Leader&apos;s cut</th>
            <th className="px-4 py-2 font-medium">Depositors</th>
            <th className="px-4 py-2 font-medium">Positions</th>
            <th className="px-4 py-2 font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.vault} className="border-t text-right hover:bg-accent/40">
              <td className="px-4 py-2 text-left">
                <Link href={`/vaults/${v.vault}`} className="font-medium hover:underline">
                  {v.marketMakerFor ? `${v.marketMakerFor} market maker` : v.name || shortAddr(v.vault)}
                </Link>
                <div className="font-mono text-[11px] text-muted-foreground">{v.marketMakerFor ? shortAddr(v.vault) : `led by ${shortAddr(v.leader)}`}</div>
              </td>
              <td className="px-4 py-2">{compact(Number(v.nav))}</td>
              <td className="px-4 py-2">{v.shareValue ? fixed(v.shareValue, 4) : '—'}</td>
              <td className="px-4 py-2">{(Number(v.profitShare) * 100).toFixed(0)} %</td>
              <td className="px-4 py-2">{v.holders}</td>
              <td className="px-4 py-2">{Object.keys(v.positions).length}</td>
              <td className="px-4 py-2 text-muted-foreground">{timeAgo(v.created)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateVault() {
  const w = useWallet()
  const account = useAccount()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('100')
  const [share, setShare] = useState('10')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const free = w.actingAs ? null : (account.data?.perp?.withdrawable ?? null)
  const unit = collateralLabel(account.data)
  const problem = (() => {
    if (!name.trim()) return 'Name it.'
    if (!isAmount(amount) || Number(amount) < 100) return 'A vault starts with at least 100.'
    if (free !== null && Number(amount) > Number(free)) return `You have ${fixed(free, 2)} ${unit} of free perps collateral.`
    if (!(Number(share) >= 0 && Number(share) <= 50)) return 'The profit share is 0–50 %.'
    if (w.actingAs) return 'Switch the trading account to your own to start a vault.'
    return null
  })()
  const create = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await w.sendExchange({
        op: 'VAULT_CREATE',
        params: { name: name.trim(), amount, profit_share: String(Number(share) / 100) },
        label: `Start the vault ${name.trim()} with ${amount} ${unit}`,
      })
      setMsg({ ok: true, text: 'Submitted: it appears here with the next block.' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mt-8 max-w-xl rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Start a vault</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        From your free perps collateral ({free === null ? '—' : `${fixed(free, 2)} ${unit}`}). You keep at least 5 % of its shares while anyone else holds any; at most 5 vaults a leader.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="col-span-3 text-xs text-muted-foreground sm:col-span-1">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className="mt-1 h-9 text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">
          Deposit ({unit})
          <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} inputMode="decimal" className="num mt-1 h-9 text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">
          Your cut of gains (%)
          <Input value={share} onChange={(e) => setShare(e.target.value.trim())} inputMode="decimal" className="num mt-1 h-9 text-sm" />
        </label>
      </div>
      <div className="mt-3">
        {!w.trader ? (
          <ConnectButton className="w-full" />
        ) : (
          <Button className="w-full" disabled={!!problem || busy || !w.rightNetwork} onClick={() => void create()}>
            {busy ? 'Confirm in wallet…' : (problem ?? 'Start the vault')}
          </Button>
        )}
      </div>
      {msg && <p className={cn('mt-2 text-xs', msg.ok ? 'text-bid' : 'text-ask')}>{msg.text}</p>}
    </section>
  )
}
