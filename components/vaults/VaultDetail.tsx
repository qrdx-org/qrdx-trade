'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useAccount } from '@/components/trade/SpotTradeView'
import { collateralLabel } from '@/components/trade/PerpOrderForm'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { fixed, compact, price as fmtPrice, size as fmtSize, timeAgo } from '@/lib/format'
import { isAmount } from '@/lib/decimal'
import { useApi } from '@/lib/hooks/useApi'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'
import { shortAddr, type VaultRow } from './VaultsView'

export function VaultDetail({ address }: { address: string }) {
  const { apiBase } = useNet()
  const w = useWallet()
  const v = useApi<VaultRow>(`${apiBase}/vaults/${address}${w.trader ? `?holder=${w.trader}` : ''}`, 10_000)
  const account = useAccount()
  const unit = collateralLabel(account.data)
  const [amount, setAmount] = useState('')
  const [shares, setShares] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (v.error && !v.data) return <main className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-muted-foreground">{v.error.message}</main>
  const d = v.data
  if (!d) return <main className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-muted-foreground">Loading…</main>
  const leader = !!w.trader && d.leader.toLowerCase() === w.trader.toLowerCase() && !d.marketMakerFor
  const h = d.holding
  const unlock = h ? Number(h.unlock) : 0
  const locked = unlock > Date.now() / 1000
  const go = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: 'Submitted: it applies with the next block.' })
      setAmount('')
      setShares('')
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }
  const positions = Object.entries(d.positions)
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/vaults" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Vaults
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{d.marketMakerFor ? `${d.marketMakerFor} market maker` : d.name || shortAddr(d.vault)}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{d.vault}</span>
        <ExplorerLink id={d.vault} />
        {!d.marketMakerFor && <span>· led by <span className="font-mono">{shortAddr(d.leader)}</span></span>}
        <span>· started {timeAgo(d.created)}</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile k="Value (NAV)" v={`${compact(Number(d.nav))} ${unit}`} />
        <Tile k="Share value" v={d.shareValue ? fixed(d.shareValue, 6) : '—'} />
        <Tile k="Leader's cut of gains" v={`${(Number(d.profitShare) * 100).toFixed(0)} %`} />
        <Tile k="Depositors" v={String(d.holders)} />
      </div>
      <section className="mt-4 rounded-xl border bg-card">
        <h2 className="border-b px-4 py-2.5 text-sm font-semibold">Positions</h2>
        {positions.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No open positions.</p>
        ) : (
          <table className="num w-full text-sm">
            <tbody>
              {positions.map(([mid, p]) => (
                <tr key={mid} className="border-t text-right first:border-t-0">
                  <td className="px-4 py-2 text-left">{mid}</td>
                  <td className={cn('px-4 py-2', Number(p.size) > 0 ? 'text-bid' : 'text-ask')}>{fmtSize(p.size)}</td>
                  <td className="px-4 py-2 text-muted-foreground">entry {fmtPrice(p.entry_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="mt-4 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Your shares</h2>
        {h && Number(h.shares) > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {fixed(h.shares, 4)} shares worth {fixed(h.value, 2)} {unit} (cost {fixed(h.cost, 2)}){locked ? ` · locked until ${new Date(unlock * 1000).toLocaleString()}` : ''}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">None. Deposits come from your free perps collateral and are locked for {Math.round(d.lockupSeconds / 3600)} h.</p>
        )}
        {!w.trader ? (
          <ConnectButton className="mt-3 w-full" />
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2">
              <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} placeholder={`Deposit (${unit})`} inputMode="decimal" className="num h-9 text-sm" />
              <Button
                variant="outline"
                className="h-9"
                disabled={!!busy || !isAmount(amount) || Number(amount) <= 0 || !!w.actingAs}
                onClick={() => void go('dep', () => w.sendExchange({ op: 'VAULT_DEPOSIT', params: { vault: d.vault, amount }, label: `Deposit ${amount} ${unit} into ${d.name || shortAddr(d.vault)}` }))}
              >
                {busy === 'dep' ? '…' : 'Deposit'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Input value={shares} onChange={(e) => setShares(e.target.value.trim())} placeholder="Shares to withdraw" inputMode="decimal" className="num h-9 text-sm" />
              <Button
                variant="outline"
                className="h-9"
                disabled={!!busy || !h || locked || !isAmount(shares) || Number(shares) <= 0 || Number(shares) > Number(h.shares) || !!w.actingAs}
                onClick={() => void go('wd', () => w.sendExchange({ op: 'VAULT_WITHDRAW', params: { vault: d.vault, shares }, label: `Withdraw ${shares} shares of ${d.name || shortAddr(d.vault)}` }))}
              >
                {busy === 'wd' ? '…' : 'Withdraw'}
              </Button>
            </div>
          </div>
        )}
        {w.actingAs && <p className="mt-2 text-xs text-warn">Switch the trading account to your own to deposit or withdraw.</p>}
        {leader && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <span>You lead this vault: trade it from the perps screen.</span>
            <Button size="sm" onClick={() => w.setActingAs(d.vault)} asChild>
              <Link href="/perps">Trade as this vault</Link>
            </Button>
          </div>
        )}
        {msg && <p className={cn('mt-2 text-xs', msg.ok ? 'text-bid' : 'text-ask')}>{msg.text}</p>}
      </section>
    </main>
  )
}

function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="num mt-1 text-lg font-semibold">{v}</div>
    </div>
  )
}
