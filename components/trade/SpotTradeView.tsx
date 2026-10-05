'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AccountPanel, BalancesTable, SpotOrdersTable } from '@/components/trade/AccountPanel'
import { MarketSelector } from '@/components/trade/MarketSelector'
import { PairError, Stat, UnverifiedBanner } from '@/components/trade/MarketStatus'
import { OrderBookPanel } from '@/components/trade/OrderBookPanel'
import { PriceChart } from '@/components/trade/PriceChart'
import { SpotOrderForm } from '@/components/trade/SpotOrderForm'
import { PairBadge } from '@/components/trade/TokenBadge'
import { TradesPanel } from '@/components/trade/TradesPanel'
import { compact, percent, price as fmtPrice, tone } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { AccountResponse, OrderBook, SpotMarket, TradesResponse } from '@/lib/types'
import { onPendingChange } from '@/lib/wallet/pending'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

export function useAccount(): ReturnType<typeof useApi<AccountResponse>> {
  const { apiBase } = useNet()
  const w = useWallet()
  const acct = useApi<AccountResponse>(w.trader ? `${apiBase}/accounts/${w.trader}` : null, 6_000)
  const { refresh } = acct
  useEffect(() => onPendingChange(refresh), [refresh])
  return acct
}

export function SpotTradeView({ base, quote }: { base: string; quote: string }) {
  const { apiBase } = useNet()
  const router = useRouter()
  const api = `${apiBase}/markets/${base}/${quote}`
  const market = useApi<SpotMarket>(api, 5_000)
  const book = useApi<OrderBook>(market.data?.status === 'live' ? `${api}/orderbook?depth=40` : null, 2_000)
  const trades = useApi<TradesResponse>(market.data?.status === 'live' ? `${api}/trades?limit=60` : null, 6_000)
  const account = useAccount()
  const [picked, setPicked] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'chart' | 'book' | 'trades'>('chart')
  const [sideTab, setSideTab] = useState<'book' | 'trades'>('book')

  // An address URL for a verified token: the API redirected; follow it in the page URL too.
  useEffect(() => {
    if (market.redirectedTo) router.replace(market.redirectedTo.replace(`${apiBase}/markets`, '/trade'))
  }, [market.redirectedTo, router])

  const m = market.data
  if (market.error && !m) return <PairError error={market.error} kind="spot" />
  if (!m) return <div className="p-10 text-center text-sm text-muted-foreground">Loading market…</div>

  const ref = Number(m.last ?? m.indexPrice ?? 1)
  const pairLabel = `${m.base.symbol}/${m.quote.symbol}`

  const bookPanel = (
    <OrderBookPanel book={book.data} error={book.error} baseSymbol={m.base.symbol} quoteSymbol={m.quote.symbol} onPick={setPicked} />
  )
  const tradesPanel = (
    <TradesPanel
      data={trades.data}
      error={trades.error}
      baseSymbol={m.base.symbol}
      quoteSymbol={m.quote.symbol}
      note="Swaps only: the node does not yet publish order-book fill prices."
    />
  )

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col lg:h-[calc(100vh-3rem)]">
      <UnverifiedBanner assets={[m.base, m.quote]} />
      {/* market bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-3 py-2">
        <MarketSelector label={pairLabel}>
          <PairBadge base={m.base} quote={m.quote} size="sm" />
        </MarketSelector>
        <div className="flex flex-col leading-tight">
          <span className={cn('text-lg font-semibold tabular', tone(m.change24h))}>{fmtPrice(m.last, ref)}</span>
          <span className="text-[10px] text-muted-foreground">{m.lastSource === 'pool' ? 'pool price' : 'last trade'}</span>
        </div>
        <Stat label="24h change" value={percent(m.change24h)} className={tone(m.change24h)} />
        <Stat label={`24h volume (${m.quote.symbol})`} value={compact(m.volume24h)} />
        <Stat
          label="Index price"
          value={
            m.indexPrice ? (
              <span title={`${m.baseIndex?.source ?? ''} reference, not a QRDX price`}>{fmtPrice(m.indexPrice, ref)}</span>
            ) : (
              '—'
            )
          }
        />
        <Stat label="Best bid / ask" value={`${fmtPrice(m.bestBid, ref)} / ${fmtPrice(m.bestAsk, ref)}`} />
        <Stat label="Pools" value={m.pools.length ? m.pools.map((p) => `${Number(p.feeRate) * 100}%`).join(' · ') : '—'} />
      </div>

      {m.status !== 'live' && (
        <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {m.status === 'node_unavailable'
            ? 'The QRDX node is unreachable. Showing reference prices only.'
            : m.status === 'unlisted'
              ? `${[m.base, m.quote].filter((a) => !a.listed).map((a) => a.symbol).join(' and ')} has no token on this network yet. Showing the index price only.`
              : `No pool exists for ${pairLabel} yet, so it has no order book. A pool creates both.`}
        </div>
      )}

      {/* mobile tabs */}
      <div className="flex gap-1 border-b px-2 text-sm lg:hidden">
        {(['chart', 'book', 'trades'] as const).map((t) => (
          <button key={t} onClick={() => setMobileTab(t)} className={cn('px-3 py-1.5 capitalize', mobileTab === t ? 'border-b-2 border-primary' : 'text-muted-foreground')}>
            {t}
          </button>
        ))}
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px_300px] lg:grid-rows-[minmax(0,1fr)_260px]">
        <div className={cn('min-h-[360px] border-b lg:border-r lg:min-h-0', mobileTab !== 'chart' && 'hidden lg:block')}>
          <PriceChart basePath={api} />
        </div>
        <div className={cn('flex min-h-[420px] flex-col border-b lg:min-h-0 lg:border-r', mobileTab === 'chart' && 'hidden lg:flex')}>
          <div className="hidden gap-1 border-b px-2 text-sm lg:flex">
            {(['book', 'trades'] as const).map((t) => (
              <button key={t} onClick={() => setSideTab(t)} className={cn('px-2 py-1.5', sideTab === t ? 'border-b-2 border-primary' : 'text-muted-foreground')}>
                {t === 'book' ? 'Order book' : 'Trades'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <div className="hidden h-full lg:block">{sideTab === 'book' ? bookPanel : tradesPanel}</div>
            <div className="h-full lg:hidden">{mobileTab === 'book' ? bookPanel : tradesPanel}</div>
          </div>
        </div>
        <div className="border-b lg:row-span-2 lg:border-b-0 lg:overflow-y-auto">
          <SpotOrderForm market={m} book={book.data} account={account.data} pickedPrice={picked} />
        </div>
        <div className="min-h-[220px] lg:col-span-2 lg:border-r lg:border-t lg:min-h-0">
          <AccountPanel
            tabs={[
              { id: 'balances', label: 'Balances', render: () => <BalancesTable account={account.data} /> },
              {
                id: 'orders',
                label: `Open orders${account.data?.spotOrders.length ? ` (${account.data.spotOrders.length})` : ''}`,
                render: () => <SpotOrdersTable account={account.data} />,
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
