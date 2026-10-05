'use client'

import { useEffect, useState } from 'react'
import { AccountPanel } from '@/components/trade/AccountPanel'
import { MarketSelector } from '@/components/trade/MarketSelector'
import { PairError, Stat } from '@/components/trade/MarketStatus'
import { OrderBookPanel } from '@/components/trade/OrderBookPanel'
import { PerpOrderForm } from '@/components/trade/PerpOrderForm'
import { PerpOrdersTable, PositionsTable } from '@/components/trade/PerpTables'
import { PriceChart } from '@/components/trade/PriceChart'
import { useAccount } from '@/components/trade/SpotTradeView'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { TradesPanel } from '@/components/trade/TradesPanel'
import { compact, countdown, fixed, percent, price as fmtPrice, tone } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { OrderBook, PerpMarket, TradesResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet } from '@/lib/wallet/WalletContext'

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function PerpTradeView({ base, quote }: { base: string; quote: string }) {
  const { apiBase } = useNet()
  const api = `${apiBase}/perps/${base}/${quote}`
  const market = useApi<PerpMarket>(api, 4_000)
  const book = useApi<OrderBook>(market.data ? `${api}/orderbook?depth=40` : null, 2_000)
  const trades = useApi<TradesResponse>(market.data ? `${api}/trades?limit=60` : null, 5_000)
  const account = useAccount()
  const [picked, setPicked] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'chart' | 'book' | 'trades'>('chart')
  const [sideTab, setSideTab] = useState<'book' | 'trades'>('book')
  const now = useNow()

  const m = market.data
  if (market.error && !m) return <PairError error={market.error} kind="perp" />
  if (!m) return <div className="p-10 text-center text-sm text-muted-foreground">Loading market…</div>

  const ref = Number(m.markPrice ?? m.oraclePrice ?? 1)
  const oracleAge = m.oracleTime ? Math.round(now - m.oracleTime) : null
  const positions = Object.values(account.data?.perp?.positions ?? {}).filter((p) => Number(p.size) !== 0).length

  const bookPanel = (
    <OrderBookPanel book={book.data} error={book.error} baseSymbol={m.base} quoteSymbol={m.quote} onPick={setPicked} mark={m.markPrice} />
  )
  const tradesPanel = <TradesPanel data={trades.data} error={trades.error} baseSymbol={m.base} quoteSymbol={m.quote} />

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col lg:h-[calc(100vh-3rem)]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-3 py-2">
        <MarketSelector label={`${m.base}-${m.quote}`}>
          <TokenBadge asset={m.baseAsset ?? { symbol: m.base, color: '#888', verified: true }} size="sm" />
        </MarketSelector>
        <div className="flex flex-col leading-tight">
          <span className={cn('text-lg font-semibold tabular', tone(m.change24h))}>{fmtPrice(m.markPrice, ref)}</span>
          <span className="text-[10px] text-muted-foreground">mark</span>
        </div>
        <Stat
          label="Oracle"
          value={
            <span title="Stake-weighted median of validator votes">
              {fmtPrice(m.oraclePrice, ref)}
              {oracleAge !== null && oracleAge > 120 ? <span className="ml-1 text-amber-500">({oracleAge}s old)</span> : null}
            </span>
          }
        />
        <Stat label="Index" value={m.indexPrice ? <span title={`${m.indexSource} reference`}>{fmtPrice(m.indexPrice, ref)}</span> : '—'} />
        <Stat label="24h change" value={percent(m.change24h)} className={tone(m.change24h)} />
        <Stat label={`24h volume (${m.quote})`} value={compact(m.volume24h)} />
        <Stat label="Open interest" value={m.openInterest ? `${fixed(m.openInterest, 3)} ${m.base}` : '—'} />
        <Stat
          label="Funding / countdown"
          value={
            <>
              <span className={tone(m.fundingRate)}>{m.fundingRate ? `${(Number(m.fundingRate) * 100).toFixed(4)}%` : '—'}</span>
              <span className="ml-2 text-muted-foreground">{countdown(m.nextFundingTime, now)}</span>
            </>
          }
        />
      </div>

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
          <PerpOrderForm market={m} book={book.data} account={account.data} pickedPrice={picked} />
        </div>
        <div className="min-h-[220px] lg:col-span-2 lg:border-r lg:border-t lg:min-h-0">
          <AccountPanel
            tabs={[
              { id: 'positions', label: `Positions${positions ? ` (${positions})` : ''}`, render: () => <PositionsTable account={account.data} /> },
              {
                id: 'orders',
                label: `Open orders${account.data?.perp?.orders.length ? ` (${account.data.perp.orders.length})` : ''}`,
                render: () => <PerpOrdersTable account={account.data} />,
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
