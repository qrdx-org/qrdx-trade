'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'
import { TradingAccountPicker, TradingAccountWarning } from '@/components/accounts/AccountSwitcher'
import { useApi } from '@/lib/hooks/useApi'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

export interface AccountControl {
  address: string
  agents: { agent: string; name: string; valid_until: string; max_notional_per_day?: string; placed_today?: string }[]
  subaccounts: { subaccount: string; index: number; name: string }[]
  vaults: { vault: string; name: string; nav: string }[]
  fees: {
    volume?: string
    taker?: string
    maker?: string
    referrer?: string | null
    referral_code?: string | null
    referred_volume?: string | null
    tiers: { volume: string; taker: string; maker: string }[]
    referral: { referee_discount: string; referrer_share: string; volume_cap: string; join_before_volume: string }
    volume_days: number
  } | null
}

/** The wallet account's agents, sub-accounts, vaults it leads and fee tier (null before it loads, or on an older node). */
export function useAccountControl() {
  const w = useWallet()
  const { apiBase } = useNet()
  const { trading } = useFeatures()
  return useApi<AccountControl>(trading && w.trader ? `${apiBase}/accounts/${w.trader}/control` : null, 15_000)
}

/**
 * Above the order forms: which account trades (the wallet's own, a sub-account, a vault it
 * leads: components/accounts) and one-click trading. Only on a node with the trading features.
 */
export function TradingAccountBar() {
  const w = useWallet()
  const { trading } = useFeatures()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!trading || !w.trader) return null
  const live = !!w.oneClick && w.oneClick.approved && w.oneClick.validUntil > Date.now() / 1000
  const toggle = async () => {
    setBusy(true)
    setMsg(null)
    try {
      if (w.oneClick) await w.disableOneClick()
      else await w.enableOneClick()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-1.5 border-b px-3 py-2 text-[11px]">
      <div className="flex items-center gap-2">
        <TradingAccountPicker />
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          title="Sign orders, cancels and edits in this browser with a trading key your wallet approves once (7 days). It can trade but never withdraw or transfer."
          className={cn(
            'ml-auto flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 font-medium transition-colors disabled:opacity-50',
            live ? 'border-bid/40 bg-bid/10 text-bid' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Zap className="h-3 w-3" />
          {busy ? (w.oneClick ? 'Approve in wallet…' : '…') : live ? 'One-click on' : w.oneClick ? 'One-click: waiting for a block' : 'One-click trading'}
        </button>
      </div>
      <TradingAccountWarning />
      {msg && <p className="text-ask">{msg}</p>}
    </div>
  )
}
