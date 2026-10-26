'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'
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

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`

/**
 * Above the order forms: which account trades (the wallet's own, a sub-account, a vault it
 * leads) and one-click trading. Only on a node with the trading features.
 */
export function TradingAccountBar() {
  const w = useWallet()
  const { trading } = useFeatures()
  const control = useAccountControl()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!trading || !w.trader) return null
  const subs = control.data?.subaccounts ?? []
  const vaults = control.data?.vaults ?? []
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
    <div className="space-y-1 border-b px-3 py-2 text-[11px]">
      <div className="flex items-center gap-2">
        {(subs.length > 0 || vaults.length > 0 || w.actingAs) && (
          <select
            value={w.actingAs ?? ''}
            onChange={(e) => w.setActingAs(e.target.value || null)}
            className="h-7 min-w-0 flex-1 rounded-md border bg-background px-1.5"
            aria-label="Trading account"
            title="The account these forms trade: yours, a sub-account, or a vault you lead"
          >
            <option value="">Main account</option>
            {subs.map((s) => (
              <option key={s.subaccount} value={s.subaccount}>
                Sub-account {s.name || `#${s.index}`} · {short(s.subaccount)}
              </option>
            ))}
            {vaults.map((v) => (
              <option key={v.vault} value={v.vault}>
                Vault {v.name || short(v.vault)}
              </option>
            ))}
            {w.actingAs && !subs.some((s) => s.subaccount === w.actingAs) && !vaults.some((v) => v.vault === w.actingAs) && <option value={w.actingAs}>{short(w.actingAs)}</option>}
          </select>
        )}
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          title="Sign orders, cancels and edits in this browser with a trading key your wallet approves once (7 days). It can trade but never withdraw or transfer."
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-medium transition-colors disabled:opacity-50',
            live ? 'border-bid/40 bg-bid/10 text-bid' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Zap className="h-3 w-3" />
          {busy ? (w.oneClick ? 'Approve in wallet…' : '…') : live ? 'One-click on' : w.oneClick ? 'One-click: waiting for a block' : 'One-click trading'}
        </button>
      </div>
      {w.actingAs && <p className="text-muted-foreground">Trading as {w.actingAs.startsWith('0xUVLT') ? 'a vault you lead' : 'a sub-account'}: balances, orders and positions below are its own.</p>}
      {msg && <p className="text-ask">{msg}</p>}
    </div>
  )
}
