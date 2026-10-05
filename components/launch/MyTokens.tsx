'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { shortAddress } from '@/lib/assets'
import { dec, str } from '@/lib/decimal'
import { compact } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import { isAuthorityAddress } from '@/lib/launch'
import type { AccountResponse, ApiAsset } from '@/lib/types'
import { onPendingChange } from '@/lib/wallet/pending'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

interface TokenRow extends ApiAsset {
  totalSupply: string
  maxSupply: string | null
  creator: string
  mintAuthority: string | null
  freezeAuthority: string | null
}

/**
 * Tokens the connected account created or may mint: mint more (TOKEN_MINT, to
 * itself or anyone, within the cap), give up minting for good
 * (TOKEN_SET_AUTHORITY), or start a market.
 */
export function MyTokens() {
  const w = useWallet()
  const { apiBase } = useNet()
  const list = useApi<{ tokens?: TokenRow[] }>(w.trader ? `${apiBase}/assets?all=1` : null, 15_000)

  // Every form of the account: authorities are kept as given, in either address form.
  const mine = useMemo(() => {
    const ids = [w.account?.pqAddress, w.account?.address, w.account?.pqAccountId].filter(Boolean).map((a) => a!.toLowerCase())
    const isMe = (a: string | null) => !!a && ids.includes(a.toLowerCase())
    return (list.data?.tokens ?? [])
      .filter((t) => isMe(t.mintAuthority) || isMe(t.creator))
      .map((t) => ({ ...t, canMint: isMe(t.mintAuthority) }))
  }, [list.data, w.account])

  const balances = useApi<AccountResponse>(
    w.trader && mine.length ? `${apiBase}/accounts/${w.trader}?tokens=${mine.map((t) => t.address).join(',')}` : null,
    10_000
  )
  const { refresh: refreshList } = list
  const { refresh: refreshBalances } = balances
  useEffect(() => onPendingChange(() => { refreshList(); refreshBalances() }), [refreshList, refreshBalances])

  if (!w.trader || !mine.length) return null
  const balanceOf = (a: string | null) => balances.data?.balances.find((b) => b.asset.address === a)?.balance ?? null

  return (
    <section className="mt-4 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Your tokens</h2>
      <p className="mt-1 text-xs text-muted-foreground">Tokens you created, or may mint.</p>
      <div className="mt-3 space-y-3">
        {mine.map((t) => (
          <TokenCard key={t.segment} t={t} balance={balanceOf(t.address)} />
        ))}
      </div>
    </section>
  )
}

function TokenCard({ t, balance }: { t: TokenRow & { canMint: boolean }; balance: string | null }) {
  const w = useWallet()
  const [open, setOpen] = useState<'mint' | 'renounce' | null>(null)
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const room = t.maxSupply ? dec(t.maxSupply) - dec(t.totalSupply) : null
  const problem = (() => {
    if (!/^\d+(\.\d+)?$/.test(amount) || dec(amount) <= 0n) return 'Enter an amount.'
    if (room !== null && dec(amount) > room) return `The cap allows ${compact(t.maxSupply!)} in total; ${compact(str(room))} more at most.`
    if (to.trim() && !isAuthorityAddress(to.trim())) return 'The recipient must be a 0x… or 0xPQ… address.'
    return null
  })()

  const send = async (op: string, params: Record<string, unknown>, label: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await w.sendExchange({ op, params, label })
      setMsg({ ok: true, text: 'Submitted. It executes when the next block includes it (~3 min).' })
      setOpen(null)
      setAmount('')
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border p-3 text-xs" data-testid={`token-${t.symbol}`}>
      <div className="flex items-center gap-2">
        <TokenBadge asset={t} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {t.name} <span className="text-muted-foreground">{t.symbol}</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">{shortAddress(t.address ?? '', 6)}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-y-0.5 tabular">
        <span className="text-muted-foreground">Supply</span>
        <span className="text-right" data-testid="supply">
          {compact(t.totalSupply)}
          {t.maxSupply ? ` / ${compact(t.maxSupply)} max` : ''}
        </span>
        <span className="text-muted-foreground">You hold</span>
        <span className="text-right">{balance === null ? '—' : compact(balance)}</span>
        <span className="text-muted-foreground">Minting</span>
        <span className={cn('text-right', t.mintAuthority ? 'text-amber-500' : 'text-bid')}>
          {t.mintAuthority ? (t.canMint ? 'you' : shortAddress(t.mintAuthority, 4)) : 'fixed supply'}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {t.canMint && (
          <Button size="sm" variant={open === 'mint' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setOpen(open === 'mint' ? null : 'mint')}>
            Mint
          </Button>
        )}
        {t.canMint && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(open === 'renounce' ? null : 'renounce')}>
            Give up minting
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
          <Link href={`/launch?token=${t.address}`}>Start market</Link>
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
          <Link href={`/pools/new?token=${t.address}`}>Pool</Link>
        </Button>
      </div>

      {open === 'mint' && (
        <div className="mt-2 space-y-1.5">
          <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} placeholder={`Amount of ${t.symbol}`} inputMode="decimal" className="h-8 tabular" />
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Send to (default: you)" className="h-8 font-mono text-[11px]" />
          <Button
            size="sm"
            className="w-full"
            disabled={!!problem || busy || !w.rightNetwork}
            onClick={() =>
              send(
                'TOKEN_MINT',
                { token_address: t.address, amount, ...(to.trim() ? { to: to.trim() } : {}) },
                `Mint ${amount} ${t.symbol}${to.trim() ? ` to ${shortAddress(to.trim(), 4)}` : ''}`
              )
            }
          >
            {busy ? 'Confirm in wallet…' : problem && amount ? problem : `Mint ${amount || ''} ${t.symbol}`}
          </Button>
        </div>
      )}
      {open === 'renounce' && (
        <div className="mt-2 space-y-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-2">
          <p>
            No one will ever be able to mint {t.symbol} again: its supply becomes fixed at {compact(t.totalSupply)}. This cannot be
            undone.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={busy || !w.rightNetwork}
            onClick={() => send('TOKEN_SET_AUTHORITY', { token_address: t.address, authority: 'mint', new_authority: '' }, `Give up minting ${t.symbol}`)}
          >
            {busy ? 'Confirm in wallet…' : `Give up minting ${t.symbol} for good`}
          </Button>
        </div>
      )}
      {msg && <p className={cn('mt-2', msg.ok ? 'text-bid' : 'text-ask')}>{msg.text}</p>}
    </div>
  )
}
