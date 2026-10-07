'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AccountPanel, BalancesTable, SpotOrdersTable } from '@/components/trade/AccountPanel'
import { MarketSelector } from '@/components/trade/MarketSelector'
import { PairError, UnverifiedBanner } from '@/components/trade/MarketStatus'
import { HeaderStat, MarketHeader } from '@/components/trade/MarketHeader'
import { Panel, PanelTabs } from '@/components/trade/Panel'
import { MarketInfo } from '@/components/trade/TokenInfo'
import { TradeGate } from '@/components/trade/TradeGate'
import { BadgeCheck, ExternalLink } from 'lucide-react'
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
import { explorerLink } from '@/lib/config'
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
  const { apiBase, network } = useNet()
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
  if (!m) return <TerminalSkeleton />

  const ref = Number(m.last ?? m.indexPrice ?? 1)
  const pairLabel = `${m.base.symbol}/${m.quote.symbol}`
  const usdQuote = m.quote.symbol.startsWith('USD')
  const route = m.baseUsd?.route ?? []

  const bookPanel = (
    <OrderBookPanel book={book.data} error={book.error} baseSymbol={m.base.symbol} quoteSymbol={m.quote.symbol} onPick={setPicked} />
  )
  const tradesPanel = (
    <TradesPanel
      data={trades.data}
      error={trades.error}
      baseSymbol={m.base.symbol}
      quoteSymbol={m.quote.symbol}
      note={
        trades.data?.available === false
          ? "This network's node does not publish individual trades. The chart and 24h change come from pool prices recorded every minute."
          : 'Swaps only: the node does not yet publish order-book fill prices.'
      }
    />
  )

  const stats: HeaderStat[] = [
    { label: '24h change', value: percent(m.change24h), className: tone(m.change24h) },
    { label: `24h volume (${m.quote.symbol})`, value: compact(m.volume24h) },
  ]
  if (m.baseUsd && !usdQuote) {
    stats.push({
      label: `${m.base.symbol} in USD`,
      value: (
        <>
          ${fmtPrice(m.baseUsd.price, Number(m.baseUsd.price))}
          {m.baseUsd.change24h !== null && <span className={cn('ml-1.5 text-[11px]', tone(m.baseUsd.change24h))}>{percent(m.baseUsd.change24h)}</span>}
        </>
      ),
      title:
        m.baseUsd.source === 'route'
          ? `Priced through pools: ${route.join(' → ')}, then ${route[route.length - 1]} in USD`
          : `${m.baseUsd.source} index price`,
    })
  }
  stats.push(
    {
      label: 'Index price',
      value: m.indexPrice ? fmtPrice(m.indexPrice, ref) : '—',
      title: m.indexPrice ? `${m.baseIndex?.source ?? ''} reference, not a QRDX price` : 'No public index price for this pair',
    },
    { label: 'Bid / Ask', value: m.bestBid || m.bestAsk ? `${fmtPrice(m.bestBid, ref)} / ${fmtPrice(m.bestAsk, ref)}` : '—' },
    { label: 'Pool fees', value: m.pools.length ? m.pools.map((p) => `${+(Number(p.feeRate) * 100).toFixed(2)}%`).join(' · ') : '—' }
  )

  return (
    <div className="flex min-h-full flex-col gap-1 bg-canvas lg:h-full lg:p-1">
      <UnverifiedBanner assets={[m.base, m.quote]} />
      <MarketHeader
        path={m.path}
        selector={
          <MarketSelector
            label={pairLabel}
            sub={
              <span className="flex items-center gap-1">
                {m.base.name}
                {m.base.verified ? <BadgeCheck className="h-3 w-3 text-primary" /> : <span className="text-warn">· unverified</span>}
              </span>
            }
          >
            <PairBadge base={m.base} quote={m.quote} size="lg" />
          </MarketSelector>
        }
        price={fmtPrice(m.last, ref)}
        priceRaw={m.last}
        priceClass={tone(m.change24h)}
        priceSub={
          m.baseUsd && !usdQuote
            ? `≈ $${fmtPrice(m.baseUsd.price, Number(m.baseUsd.price))}`
            : m.lastSource === 'pool'
              ? 'pool price'
              : m.lastSource === 'trade'
                ? 'last trade'
                : 'no price yet'
        }
        stats={stats}
        right={
          m.base.address && !m.base.verified ? (
            <a
              href={explorerLink(network, 'address', m.base.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Contract <ExternalLink className="h-3 w-3" />
            </a>
          ) : null
        }
      />

      {m.status !== 'live' && (
        <div className="border-b bg-card px-3 py-2 text-xs text-muted-foreground lg:rounded-lg lg:border">
          {m.status === 'node_unavailable'
            ? 'The QRDX node is unreachable. Showing reference prices only.'
            : m.status === 'unlisted'
              ? `${[m.base, m.quote].filter((a) => !a.listed).map((a) => a.symbol).join(' and ')} has no token on this network yet. Showing the index price only.`
              : `No pool exists for ${pairLabel} yet, so it has no order book. A pool creates both.`}
        </div>
      )}

      {/* phones: one panel at a time */}
      <div className="flex border-b bg-card text-sm lg:hidden">
        {(['chart', 'book', 'trades'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMobileTab(t)}
            className={cn('relative flex-1 py-2.5 font-medium capitalize', mobileTab === t ? 'text-foreground' : 'text-muted-foreground')}
          >
            {t === 'book' ? 'Order book' : t}
            {mobileTab === t && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1 lg:grid-cols-[minmax(0,1fr)_300px_320px] lg:grid-rows-[minmax(0,1fr)_minmax(220px,32%)] xl:grid-cols-[minmax(0,1fr)_320px_340px]">
        <Panel className={cn('min-h-[420px] lg:min-h-0', mobileTab !== 'chart' && 'hidden lg:flex')}>
          <PriceChart basePath={api} watermark={pairLabel} />
        </Panel>
        <Panel className={cn('min-h-[460px] lg:min-h-0', mobileTab === 'chart' && 'hidden lg:flex')}>
          <PanelTabs
            className="hidden lg:flex"
            tabs={[
              { id: 'book', label: 'Order book' },
              { id: 'trades', label: 'Trades' },
            ]}
            value={sideTab}
            onChange={(v) => setSideTab(v as 'book' | 'trades')}
          />
          <div className="min-h-0 flex-1">
            <div className="hidden h-full lg:block">{sideTab === 'book' ? bookPanel : tradesPanel}</div>
            <div className="h-full lg:hidden">{mobileTab === 'book' ? bookPanel : tradesPanel}</div>
          </div>
        </Panel>
        <Panel className="lg:row-span-2">
          <div className="flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
            <TradeGate>
              <SpotOrderForm market={m} book={book.data} account={account.data} pickedPrice={picked} />
            </TradeGate>
          </div>
        </Panel>
        <Panel className="min-h-[260px] lg:col-span-2 lg:min-h-0">
          <AccountPanel
            tabs={[
              { id: 'balances', label: 'Balances', render: () => <BalancesTable account={account.data} /> },
              {
                id: 'orders',
                label: `Open orders${account.data?.spotOrders.length ? ` (${account.data.spotOrders.length})` : ''}`,
                render: () => <SpotOrdersTable account={account.data} />,
              },
            ]}
            extra={[{ id: 'info', label: 'Info', public: true, render: () => <MarketInfo base={m.base} quote={m.quote} pools={m.pools} /> }]}
          />
        </Panel>
      </div>
    </div>
  )
}

/** The terminal's shape while the market loads, so the page does not jump. */
export function TerminalSkeleton() {
  return (
    <div className="flex h-full flex-col gap-1 bg-canvas p-1">
      <div className="h-[58px] animate-pulse rounded-lg border bg-card" />
      <div className="grid flex-1 gap-1 lg:grid-cols-[minmax(0,1fr)_300px_320px]">
        <div className="animate-pulse rounded-lg border bg-card" />
        <div className="hidden animate-pulse rounded-lg border bg-card lg:block" />
        <div className="hidden animate-pulse rounded-lg border bg-card lg:block" />
      </div>
    </div>
  )
}
