'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { AccountAvatar } from '@/components/accounts/AccountBits'
import { useAccounts } from '@/components/accounts/AccountsContext'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { S, isAmount } from '@/lib/decimal'
import { size as fmtSize } from '@/lib/format'
import { SUBACCOUNT_NAME_MAX } from '@/lib/subaccounts'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/**
 * SUBACCOUNT_CREATE, and with an amount a first SUBACCOUNT_TRANSFER to the address it will get:
 * one approval. Then, if asked, the trading screens switch to it.
 */
export function CreateSubaccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const w = useWallet()
  const { accounts, maxSubaccounts, nextSubaccount, refresh } = useAccounts()
  const main = accounts.find((a) => a.kind === 'main')
  const count = accounts.filter((a) => a.kind === 'sub').length
  const [name, setName] = useState('')
  const [asset, setAsset] = useState('QRDX')
  const [amount, setAmount] = useState('')
  const [switchTo, setSwitchTo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setAmount('')
    setAsset('QRDX')
    setMsg(null)
  }, [open])

  const held = useMemo(() => (main?.balances ?? []).filter((b) => !S.isZero(b.balance)), [main])
  const bal = held.find((b) => (b.asset.address ?? '').toLowerCase() === asset.toLowerCase())
  const funding = amount.trim() !== ''
  const amountOk = !funding || (isAmount(amount) && !S.isZero(amount) && !!bal && S.cmp(amount, bal.balance) <= 0)
  const full = count >= maxSubaccounts
  const canFund = !!nextSubaccount

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const n = name.trim()
    const create = { op: 'SUBACCOUNT_CREATE', params: n ? { name: n } : {} }
    const label = `Create sub-account ${n || count}`
    try {
      if (funding && nextSubaccount && bal) {
        await w.sendExchangeBatch({
          ops: [create, { op: 'SUBACCOUNT_TRANSFER', params: { subaccount: nextSubaccount, asset: bal.asset.address, amount, direction: 'to_sub' } }],
          label: `${label} with ${amount} ${bal.asset.symbol}`,
        })
      } else {
        await w.sendExchange({ ...create, label })
      }
      if (switchTo && nextSubaccount) w.setActingAs(nextSubaccount)
      setMsg({ ok: true, text: `Sub-account ${n || count} is created with the next block.` })
      setTimeout(refresh, 1500)
      setTimeout(onClose, 1200)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md gap-0 overflow-y-auto rounded-xl p-0">
        <div className="border-b px-5 py-4">
          <DialogTitle className="text-base">New sub-account</DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Its own balances, margin, orders and positions, signed for by this wallet. Use one per strategy, or to keep a risky position away from the rest.
          </DialogDescription>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <AccountAvatar account={{ kind: 'sub', index: count }} size="lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <label htmlFor="sub-name" className="font-medium text-muted-foreground">
                  Name <span className="font-normal">(optional)</span>
                </label>
                <span className="num text-muted-foreground">
                  {name.length}/{SUBACCOUNT_NAME_MAX}
                </span>
              </div>
              <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Sub-account ${count}`} maxLength={SUBACCOUNT_NAME_MAX} className="h-9" />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">The name is written on chain with it and cannot be changed later.</p>

          {canFund && (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                  Fund it now <span className="font-normal">(optional)</span>
                </span>
                {bal && <span className="num text-muted-foreground">Main account: {fmtSize(bal.balance)} {bal.asset.symbol}</span>}
              </div>
              <div className={cn('flex h-10 items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring', !amountOk && 'border-ask/60')}>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(',', '.').trim())}
                  placeholder="0.00"
                  inputMode="decimal"
                  aria-label="Amount to fund"
                  className="num h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                />
                <Select value={asset} onValueChange={setAsset}>
                  <SelectTrigger aria-label="Asset" className="h-full w-auto min-w-28 gap-2 rounded-none rounded-r-md border-0 border-l bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {held.map((b) => (
                      <SelectItem key={b.asset.address} value={b.asset.address ?? b.asset.segment}>
                        <span className="flex items-center gap-2">
                          <TokenBadge asset={b.asset} size="xs" />
                          {b.asset.symbol}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">A sub-account pays its own gas in QRDX: give it some QRDX before it trades.</p>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={switchTo} onChange={(e) => setSwitchTo(e.target.checked)} className="h-3.5 w-3.5 accent-foreground" disabled={!nextSubaccount} />
            Trade as it once it is created
          </label>

          {full && <p className="text-xs text-ask">This account has all {maxSubaccounts} sub-accounts it may have.</p>}
          {msg && (
            <p className={cn('flex items-center gap-1.5 text-xs', msg.ok ? 'text-bid' : 'text-ask')}>
              {msg.ok && <Check className="h-3.5 w-3.5" />}
              {msg.text}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-4">
          <span className="num mr-auto text-xs text-muted-foreground">
            {count} of {maxSubaccounts} used
          </span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || full || !amountOk || !main} onClick={() => void submit()}>
            {busy ? 'Approve in wallet…' : funding ? 'Create and fund' : 'Create'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
