'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet } from '@/lib/hooks/useApi'
import type { PerpMarket } from '@/lib/types'
import { useNet } from '@/lib/wallet/WalletContext'

/**
 * Redirects that depend on the network shown (mainnet and testnet list
 * different markets), so they run in the browser, against the active API.
 */
/** /trade/{base} → that base's default pair on the active network. */
export function DefaultPairRedirect({ base }: { base: string }) {
  const router = useRouter()
  const { apiBase } = useNet()
  useEffect(() => {
    const ctrl = new AbortController()
    apiGet<{ path: string }>(`${apiBase}/markets/${encodeURIComponent(base)}`, ctrl.signal)
      .then(({ data }) => router.replace(data.path))
      // Unknown or ambiguous: the pair page explains (and lists tokens with that symbol).
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') router.replace(`/trade/${base}/usdc`)
      })
    return () => ctrl.abort()
  }, [apiBase, base, router])
  return <p className="p-10 text-center text-sm text-muted-foreground">Opening market…</p>
}

/** /perps → the perp market with the most open interest on the active network, else the markets list. */
export function FirstPerpRedirect() {
  const router = useRouter()
  const { apiBase, slot } = useNet()
  useEffect(() => {
    const ctrl = new AbortController()
    apiGet<{ perps: PerpMarket[] }>(`${apiBase}/perps`, ctrl.signal)
      .then(({ data }) => {
        const first = [...data.perps].sort((a, b) => Number(b.openInterest ?? 0) - Number(a.openInterest ?? 0))[0]
        // No markets yet: on testnet, offer to create one.
        router.replace(first ? first.path : slot === 'test' ? '/perps/new' : '/trade')
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') router.replace('/trade')
      })
    return () => ctrl.abort()
  }, [apiBase, router, slot])
  return <p className="p-10 text-center text-sm text-muted-foreground">Opening perps…</p>
}
