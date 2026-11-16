'use client'

import { Vault, Wallet } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts } from '@/components/accounts/AccountsContext'
import { shortAddress } from '@/lib/assets'
import { compact } from '@/lib/format'
import { accountName, accountTag } from '@/lib/subaccounts'
import type { AccountSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

/** A neutral mark per account: a wallet for the main one, its number for a sub-account, a vault. */
export function AccountAvatar({ account, size = 'md', className }: { account: Pick<AccountSummary, 'kind' | 'index'> | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'h-5 w-5 text-[10px]' : size === 'lg' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-xs'
  const icon = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5'
  return (
    <span
      aria-hidden
      className={cn(
        'num flex shrink-0 items-center justify-center rounded-md border font-semibold',
        account?.kind === 'main' ? 'border-foreground/20 bg-foreground text-background' : 'bg-muted text-foreground',
        box,
        className
      )}
    >
      {account?.kind === 'vault' ? <Vault className={icon} /> : account?.kind === 'sub' ? account.index : <Wallet className={icon} />}
    </span>
  )
}

/** Avatar, name and tag on one line; the address under it when `address` is set. */
export function AccountLabel({ account, address = false, className }: { account: AccountSummary; address?: boolean; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <AccountAvatar account={account} />
      <span className="min-w-0 text-left">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{accountName(account)}</span>
          {(account.kind !== 'sub' || account.name) && <span className="shrink-0 rounded border px-1 text-[10px] font-normal text-muted-foreground">{accountTag(account)}</span>}
        </span>
        {address && <span className="block font-mono text-[11px] text-muted-foreground">{shortAddress(account.address, 6)}</span>}
      </span>
    </span>
  )
}

export const usdText = (v: number | null) => (v === null ? '—' : v === 0 ? '$0' : compact(v, '$'))

/** Pick one of the family's accounts (vaults left out unless `vaults`). */
export function AccountSelect({
  value,
  onChange,
  exclude,
  vaults = false,
  label,
}: {
  value: string
  onChange: (address: string) => void
  exclude?: string
  vaults?: boolean
  label: string
}) {
  const { accounts, usd } = useAccounts()
  const list = accounts.filter((a) => (vaults || a.kind !== 'vault') && a.address !== exclude)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-12 px-2.5">
        <SelectValue placeholder="Choose an account" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {list.map((a) => (
          <SelectItem key={a.address} value={a.address} className="py-2">
            <span className="flex w-full items-center justify-between gap-6">
              <AccountLabel account={a} />
              <span className="num text-xs text-muted-foreground">{usdText(usd(a))}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
