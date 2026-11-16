'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownUp, Check, Info } from 'lucide-react'
import { AccountSelect } from '@/components/accounts/AccountBits'
import { useAccounts, type TransferPrefill } from '@/components/accounts/AccountsContext'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { S, isAmount, round } from '@/lib/decimal'
import { fixed, size as fmtSize } from '@/lib/format'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { accountName } from '@/lib/subaccounts'
import type { AccountSummary } from '@/lib/types'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

const assetId = (b: AccountSummary['balances'][number]) => b.asset.address ?? b.asset.segment
const isQrdx = (id: string) => id.toUpperCase() === 'QRDX'

/**
 * Move QRDX or a token between the wallet account and its sub-accounts (SUBACCOUNT_TRANSFER). One
 * sub-account to another goes through the wallet account: two transfers, one approval.
 */
export function TransferDialog({ prefill, onClose }: { prefill: TransferPrefill | null; onClose: () => void }) {
  const w = useWallet()
  const { accounts, get, refresh } = useAccounts()
  const { costs } = useFeatures()
  const main = accounts.find((a) => a.kind === 'main')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [asset, setAsset] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Each opening starts from its prefill: by default from the wallet account to the account traded as.
  useEffect(() => {
    if (!prefill) return
    const subs = accounts.filter((a) => a.kind === 'sub')
    const f = prefill.from ?? (prefill.to && prefill.to !== main?.address ? main?.address : undefined) ?? main?.address ?? ''
    const t = prefill.to ?? (f === main?.address ? (w.actingAs && get(w.actingAs)?.kind === 'sub' ? w.actingAs : subs[0]?.address) : main?.address) ?? ''
    setFrom(f)
    setTo(t !== f ? t : '')
    setAsset(prefill.asset ?? '')
    setAmount('')
    setMsg(null)
    // Only on opening; later reloads of the accounts keep what was chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  const src = get(from)
  const dst = get(to)
  const held = useMemo(() => (src?.balances ?? []).filter((b) => !S.isZero(b.balance)), [src])
  useEffect(() => {
    if (!src) return
    if (!held.some((b) => assetId(b).toLowerCase() === asset.toLowerCase())) setAsset(held[0] ? assetId(held[0]) : '')
  }, [src, held, asset])

  const bal = held.find((b) => assetId(b).toLowerCase() === asset.toLowerCase())
  // The wallet account pays this transfer's gas: Max leaves it the fee reserve in QRDX.
  const reserve = costs.feeReserveQrdx ?? '1'
  const max = !bal ? '0' : src?.kind === 'main' && isQrdx(asset) ? (S.cmp(bal.balance, reserve) > 0 ? S.sub(bal.balance, reserve) : '0') : bal.balance
  const tooMuch = bal && isAmount(amount) && S.cmp(amount, bal.balance) > 0
  const valid = !!src && !!dst && !!bal && isAmount(amount) && !S.isZero(amount) && !tooMuch
  const twoSteps = src?.kind === 'sub' && dst?.kind === 'sub'
  const dstNoGas = dst?.kind === 'sub' && S.isZero(dst.qrdx) && !isQrdx(asset)
  const srcHasQrdx = held.some((b) => isQrdx(assetId(b)))

  const submit = async () => {
    if (!src || !dst || !bal || !valid) return
    setBusy(true)
    setMsg(null)
    const move = (sub: string, direction: 'to_sub' | 'from_sub') => ({ op: 'SUBACCOUNT_TRANSFER', params: { subaccount: sub, asset: assetId(bal), amount, direction } })
    const label = `Move ${amount} ${bal.asset.symbol} from ${accountName(src)} to ${accountName(dst)}`
    try {
      if (src.kind === 'main') await w.sendExchange({ ...move(dst.address, 'to_sub'), label })
      else if (dst.kind === 'main') await w.sendExchange({ ...move(src.address, 'from_sub'), label })
      else await w.sendExchangeBatch({ ops: [move(src.address, 'from_sub'), move(dst.address, 'to_sub')], label })
      setMsg({ ok: true, text: 'Sent. Balances update when the next block includes it.' })
      setAmount('')
      setTimeout(refresh, 1500)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!prefill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md gap-0 overflow-y-auto rounded-xl p-0">
        <div className="border-b px-5 py-4">
          <DialogTitle className="text-base">Transfer between accounts</DialogTitle>
          <DialogDescription className="mt-1 text-xs">Instant, on chain, and only between accounts this wallet signs for.</DialogDescription>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">From</div>
            <AccountSelect label="From" value={from} onChange={(v) => (setFrom(v), v === to && setTo(''))} />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => (setFrom(to), setTo(from))}
              disabled={!from || !to}
              className="-my-1 flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Swap from and to"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">To</div>
            <AccountSelect label="To" value={to} onChange={setTo} exclude={from} />
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-muted-foreground">Amount</span>
              {bal && (
                <button type="button" onClick={() => setAmount(round(max, bal.asset.decimals ?? 18, 'down'))} className="num text-muted-foreground hover:text-foreground">
                  Available {fmtSize(bal.balance)} {bal.asset.symbol}
                </button>
              )}
            </div>
            <div className={cn('flex h-12 items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring', tooMuch && 'border-ask/60')}>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(',', '.').trim())}
                placeholder="0.00"
                inputMode="decimal"
                aria-label="Amount"
                className="num h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none"
              />
              <button type="button" disabled={!bal} onClick={() => bal && setAmount(round(max, bal.asset.decimals ?? 18, 'down'))} className="px-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">
                MAX
              </button>
              <Select value={asset} onValueChange={setAsset} disabled={!held.length}>
                <SelectTrigger aria-label="Asset" className="h-full w-auto min-w-28 gap-2 rounded-none rounded-r-md border-0 border-l bg-transparent">
                  <SelectValue placeholder="Asset" />
                </SelectTrigger>
                <SelectContent>
                  {held.map((b) => (
                    <SelectItem key={assetId(b)} value={assetId(b)}>
                      <span className="flex items-center gap-2">
                        <TokenBadge asset={b.asset} size="xs" />
                        {b.asset.symbol}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {bal && (
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(p === 100 ? round(max, bal.asset.decimals ?? 18, 'down') : round(S.div(S.mul(max, String(p)), '100'), bal.asset.decimals ?? 18, 'down'))}
                    className="rounded-md border py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {p === 100 ? 'Max' : `${p}%`}
                  </button>
                ))}
              </div>
            )}
            {src && !held.length && <p className="text-xs text-muted-foreground">{accountName(src)} holds nothing to move.</p>}
            {tooMuch && <p className="text-xs text-ask">More than {accountName(src!)} has available.</p>}
          </div>

          {dstNoGas && (
            <div className="flex gap-2 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
              <div>
                {accountName(dst!)} has no QRDX. A sub-account pays its own gas, so it cannot trade until it holds some.
                {srcHasQrdx && (
                  <button type="button" onClick={() => setAsset('QRDX')} className="ml-1 font-medium underline underline-offset-2">
                    Send QRDX instead
                  </button>
                )}
              </div>
            </div>
          )}
          {(twoSteps || dst?.kind === 'sub') && (
            <div className="flex gap-2 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {twoSteps ? 'Sub-accounts move funds through the main account: two transfers, signed with one approval. ' : ''}
                Funds arrive on the spot balance; deposit them as perps margin from the Perps order form while trading as that account.
              </span>
            </div>
          )}
          {msg && (
            <p className={cn('flex items-center gap-1.5 text-xs', msg.ok ? 'text-bid' : 'text-ask')}>
              {msg.ok && <Check className="h-3.5 w-3.5" />}
              {msg.text}
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t px-5 py-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {msg?.ok ? 'Done' : 'Cancel'}
          </Button>
          <Button className="flex-1" disabled={!valid || busy} onClick={() => void submit()}>
            {busy ? 'Approve in wallet…' : valid ? `Transfer ${fixed(amount, Math.min(6, (amount.split('.')[1] ?? '').length))} ${bal!.asset.symbol}` : 'Transfer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
