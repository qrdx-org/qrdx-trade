'use client'

import { MarketList } from '@/components/trade/MarketSelector'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { VERIFIED_ASSETS } from '@/lib/assets'
import { percent, usd, tone } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { IndexPrice } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet } from '@/lib/wallet/WalletContext'

export function MarketsTable() {
  const { apiBase } = useNet()
  const prices = useApi<{ prices: Record<string, IndexPrice | null> }>(`${apiBase}/prices`, 30_000)
  const listed = VERIFIED_ASSETS.filter((a) => prices.data?.prices[a.slug])
  return (
    <main className="mx-auto max-w-5xl px-3 py-6">
      <h1 className="text-2xl font-semibold">Markets</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Spot pairs and perpetuals on the QRDX chain. Books, prices and fills come from the chain itself.
      </p>

      <section className="mt-6 overflow-hidden rounded-lg border">
        <MarketList dense={false} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Index prices</h2>
        <p className="text-xs text-muted-foreground">
          USD reference prices from public exchanges, for comparison. They are not QRDX order-book prices.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {listed.map((a) => {
            const p = prices.data!.prices[a.slug]!
            return (
              <div key={a.slug} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <TokenBadge asset={{ symbol: a.symbol, color: a.color, verified: true }} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{a.symbol}</span>
                    <span className="tabular">{usd(p.price)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{p.source}</span>
                    <span className={cn('tabular', tone(p.change24h))}>{percent(p.change24h)}</span>
                  </div>
                </div>
              </div>
            )
          })}
          {prices.error && !prices.data && <p className="text-xs text-muted-foreground">Index prices unavailable.</p>}
        </div>
      </section>
    </main>
  )
}
