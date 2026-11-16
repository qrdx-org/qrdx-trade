'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { CreateSubaccountDialog } from '@/components/accounts/CreateSubaccountDialog'
import { TransferDialog } from '@/components/accounts/TransferDialog'
import { useApi } from '@/lib/hooks/useApi'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { subaccountAddress } from '@/lib/subaccounts'
import type { AccountFamily, AccountSummary, IndexPrice } from '@/lib/types'
import { onPendingChange } from '@/lib/wallet/pending'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'

export interface TransferPrefill {
  from?: string
  to?: string
  /** An asset id: "QRDX" or a token address. */
  asset?: string
}

interface AccountsState {
  /** The wallet account first, then its sub-accounts, then the vaults it leads; [] until loaded. */
  accounts: AccountSummary[]
  loaded: boolean
  /** The node has sub-accounts and a wallet is connected. */
  available: boolean
  maxSubaccounts: number
  refresh: () => void
  get: (address: string | null | undefined) => AccountSummary | null
  /** The account the trading screens act for. */
  active: AccountSummary | null
  /** Spot holdings plus perps equity at reference USD prices; null while nothing it holds is priced. */
  usd: (a: AccountSummary) => number | null
  totalUsd: number | null
  /** The next sub-account's address, known before it exists (null when it cannot be derived safely). */
  nextSubaccount: string | null
  openTransfer: (p?: TransferPrefill) => void
  openCreate: () => void
}

const Ctx = createContext<AccountsState | null>(null)

/** The key /prices answers an asset under. */
const priceKey = (asset: string) => (asset.toUpperCase() === 'QRDX' ? 'qrdx' : asset.toLowerCase())

/**
 * The wallet account's family (it, its sub-accounts, the vaults it leads) for every screen that
 * shows or switches accounts, and the two dialogs that change it: moving funds and creating a
 * sub-account.
 */
export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const w = useWallet()
  const { apiBase } = useNet()
  const { trading } = useFeatures()
  const on = trading && w.status === 'connected' && !!w.trader
  const fam = useApi<AccountFamily>(on ? `${apiBase}/accounts/${w.trader}/family` : null, 20_000)
  const { refresh } = fam
  useEffect(() => onPendingChange(refresh), [refresh])

  const accounts = useMemo(() => fam.data?.accounts ?? [], [fam.data])
  const keys = useMemo(() => {
    const k = new Set<string>()
    for (const a of accounts) {
      for (const b of a.balances) k.add(priceKey(b.asset.address ?? b.asset.segment))
      if (a.perp?.collateralToken) k.add(priceKey(a.perp.collateralToken))
    }
    return [...k].sort()
  }, [accounts])
  const prices = useApi<{ prices: Record<string, IndexPrice | null> }>(keys.length ? `${apiBase}/prices?assets=${keys.join(',')}` : null, 60_000)

  const usd = useCallback(
    (a: AccountSummary) => {
      const p = prices.data?.prices
      if (!p) return null
      let total = 0
      let priced = false
      for (const b of a.balances) {
        const px = p[priceKey(b.asset.address ?? b.asset.segment)]
        if (!px) continue
        total += (Number(b.balance) + Number(b.inOrders)) * Number(px.price)
        priced = true
      }
      if (a.perp && Number(a.perp.equity) !== 0) {
        const px = p[priceKey(a.perp.collateralToken)]
        if (px) {
          total += Number(a.perp.equity) * Number(px.price)
          priced = true
        }
      }
      return priced || (a.balances.length === 0 && !a.perp?.positions) ? total : null
    },
    [prices.data]
  )
  const totalUsd = useMemo(() => {
    if (!accounts.length || !prices.data) return null
    return accounts.reduce((s, a) => s + (usd(a) ?? 0), 0)
  }, [accounts, prices.data, usd])

  const get = useCallback((address: string | null | undefined) => (address ? (accounts.find((a) => a.address.toLowerCase() === address.toLowerCase()) ?? null) : null), [accounts])

  // Derive the next address only once the derivation reproduces an existing sub-account (or, with
  // none yet, from the address exactly as the wallet gives it).
  const nextSubaccount = useMemo(() => {
    if (!fam.data) return null
    const subs = accounts.filter((a) => a.kind === 'sub')
    if (subs.length >= fam.data.maxSubaccounts) return null
    const ok = subs.every((s) => subaccountAddress(fam.data!.master, s.index!) === s.address)
    return ok ? subaccountAddress(fam.data.master, subs.length) : null
  }, [fam.data, accounts])

  const [transfer, setTransfer] = useState<TransferPrefill | null>(null)
  const [create, setCreate] = useState(false)

  const value = useMemo<AccountsState>(
    () => ({
      accounts,
      loaded: !!fam.data,
      available: on && !!fam.data,
      maxSubaccounts: fam.data?.maxSubaccounts ?? 20,
      refresh,
      get,
      // One just chosen (a sub-account still being created) before the node lists it.
      active:
        get(w.tradingAccount) ??
        (w.tradingAccount && fam.data
          ? { address: w.tradingAccount, kind: w.actingAs?.startsWith('0xUVLT') ? 'vault' : 'sub', index: null, name: '', balances: [], qrdx: '0', perp: null, spotOrders: 0, triggers: 0 }
          : null),
      usd,
      totalUsd,
      nextSubaccount,
      openTransfer: (p) => setTransfer(p ?? {}),
      openCreate: () => setCreate(true),
    }),
    [accounts, fam.data, on, refresh, get, w.tradingAccount, w.actingAs, usd, totalUsd, nextSubaccount]
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      {on && (
        <>
          <TransferDialog prefill={transfer} onClose={() => setTransfer(null)} />
          <CreateSubaccountDialog open={create} onClose={() => setCreate(false)} />
        </>
      )}
    </Ctx.Provider>
  )
}

export function useAccounts(): AccountsState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAccounts outside AccountsProvider')
  return v
}
