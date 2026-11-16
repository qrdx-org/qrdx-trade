'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, Plus, Settings2 } from 'lucide-react'
import { AccountAvatar, AccountLabel, usdText } from '@/components/accounts/AccountBits'
import { useAccounts } from '@/components/accounts/AccountsContext'
import { S } from '@/lib/decimal'
import { accountName } from '@/lib/subaccounts'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/** Close on a click outside `ref` or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc))
  }, [open, close])
  return ref
}

/**
 * The accounts this wallet trades as, with what each is worth: choosing one points every trading
 * screen at it. Transfers, a new sub-account and the Accounts page from the foot.
 */
export function AccountMenu({ onDone, className }: { onDone: () => void; className?: string }) {
  const w = useWallet()
  const { accounts, usd, totalUsd, openTransfer, openCreate, maxSubaccounts } = useAccounts()
  const subs = accounts.filter((a) => a.kind === 'sub').length
  return (
    <div role="menu" className={cn('w-80 rounded-xl border bg-popover p-1.5 text-sm shadow-xl', className)}>
      <div className="flex items-baseline justify-between px-2.5 pb-1.5 pt-1">
        <span className="text-xs font-medium text-muted-foreground">Trade as</span>
        <span className="num text-xs text-muted-foreground">All accounts {usdText(totalUsd)}</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {accounts.map((a) => {
          const active = (w.tradingAccount ?? '').toLowerCase() === a.address.toLowerCase()
          const noGas = a.kind === 'sub' && S.isZero(a.qrdx) && a.balances.length > 0
          return (
            <button
              key={a.address}
              role="menuitemradio"
              aria-checked={active}
              onClick={() => (w.setActingAs(a.kind === 'main' ? null : a.address), onDone())}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent', active && 'bg-accent')}
            >
              <AccountLabel account={a} address className="flex-1" />
              <span className="flex shrink-0 flex-col items-end">
                <span className="num text-xs">{usdText(usd(a))}</span>
                {noGas && (
                  <span className="flex items-center gap-1 text-[10px] text-warn" title="A sub-account pays its own gas: it needs QRDX to trade">
                    <AlertTriangle className="h-2.5 w-2.5" /> no QRDX
                  </span>
                )}
              </span>
              <Check className={cn('h-3.5 w-3.5 shrink-0', active ? 'opacity-100' : 'opacity-0')} />
            </button>
          )
        })}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 border-t pt-1.5">
        <MenuAction icon={ArrowLeftRight} label="Transfer" onClick={() => (openTransfer(), onDone())} />
        <MenuAction icon={Plus} label="New" onClick={() => (openCreate(), onDone())} disabled={subs >= maxSubaccounts} />
        <Link href="/accounts" onClick={onDone} className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Settings2 className="h-4 w-4" /> Manage
        </Link>
      </div>
    </div>
  )
}

function MenuAction({ icon: Icon, label, onClick, disabled }: { icon: typeof Plus; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40">
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}

/** In the top bar, beside the wallet: the account being traded, and the menu to change it. */
export function AccountSwitcher({ className, named = false }: { className?: string; named?: boolean }) {
  const { available, active } = useAccounts()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  if (!available || !active) return null
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="The account you trade as"
        className={cn(
          'flex h-8 items-center gap-2 rounded-md border bg-background pl-1 pr-2 text-xs transition-colors hover:border-foreground/20',
          active.kind !== 'main' && 'border-foreground/40'
        )}
      >
        <AccountAvatar account={active} size="sm" />
        <span className={cn('max-w-32 truncate font-medium', named ? 'inline' : 'hidden md:inline')}>{accountName(active)}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <AccountMenu onDone={() => setOpen(false)} className="absolute right-0 top-full z-50 mt-1.5" />}
    </div>
  )
}

/** Above the order forms: the account they trade, as a button that opens the same menu. */
export function TradingAccountPicker() {
  const { available, active } = useAccounts()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  if (!available || !active) return null
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Trading account"
        className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-1.5 text-left transition-colors hover:border-foreground/20"
      >
        <AccountAvatar account={active} size="sm" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{accountName(active)}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <AccountMenu onDone={() => setOpen(false)} className="absolute left-0 top-full z-50 mt-1.5" />}
    </div>
  )
}

/** What the account traded as is missing to trade: any funds at all, or QRDX for gas. */
export function TradingAccountWarning() {
  const w = useWallet()
  const { active, openTransfer } = useAccounts()
  if (!active || !w.actingAs || active.kind === 'main') return null
  const empty = active.balances.length === 0 && !(active.perp && !S.isZero(active.perp.equity))
  const noGas = active.kind === 'sub' && !empty && S.isZero(active.qrdx)
  if (!empty && !noGas) return null
  return (
    <div className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-[11px]">
      <AlertTriangle className="h-3 w-3 shrink-0 text-warn" />
      <span className="flex-1">{empty ? `${accountName(active)} is empty.` : `${accountName(active)} has no QRDX to pay gas with.`}</span>
      <button onClick={() => openTransfer({ to: active.address, asset: empty ? undefined : 'QRDX' })} className="shrink-0 font-medium underline underline-offset-2">
        {empty ? 'Fund it' : 'Add QRDX'}
      </button>
    </div>
  )
}
