'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { AccountPanel } from '@/components/trade/AccountPanel'
import { MarketSelector } from '@/components/trade/MarketSelector'
import { PairError } from '@/components/trade/MarketStatus'
import { HeaderStat, MarketHeader } from '@/components/trade/MarketHeader'
import { Panel, PanelTabs } from '@/components/trade/Panel'
import { TradeGate } from '@/components/trade/TradeGate'
import { OrderBookPanel } from '@/components/trade/OrderBookPanel'
import { PerpOrderForm } from '@/components/trade/PerpOrderForm'
import { PerpOrdersTable, PositionsTable } from '@/components/trade/PerpTables'
import { TriggersTable, TwapsTable } from '@/components/trade/TriggerTables'
import { PriceChart } from '@/components/trade/PriceChart'
import { TerminalSkeleton, useAccount } from '@/components/trade/SpotTradeView'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { TradesPanel } from '@/components/trade/TradesPanel'
import { compact, countdown, fixed, percent, price as fmtPrice, tone } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import { useNodeStream, useStreamLive } from '@/lib/hooks/useNodeStream'
import type { OrderBook, PerpMarket, TradesResponse } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { protectiveLegError, triggerGas } from '@/lib/orders'
import { gridPrice } from '@/lib/perps'

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function PerpTradeView({ base, quote }: { base: string; quote: string }) {
  const { apiBase, slot, network } = useNet()
  const api = `${apiBase}/perps/${base}/${quote}`
  // A block every 250 ms: the node's stream says when this market changed; polling is the fallback.
  const live = useStreamLive(network.nodeUrl)
  const market = useApi<PerpMarket>(api, live ? 15_000 : 2_000)
  const book = useApi<OrderBook>(market.data ? `${api}/orderbook?depth=40` : null, live ? 15_000 : 1_500)
  const trades = useApi<TradesResponse>(market.data ? `${api}/trades?limit=60` : null, live ? 20_000 : 3_000)
  const id = market.data?.id
  useNodeStream(network.nodeUrl, [id && `perp_book:${id}`], book.refresh, 400)
  useNodeStream(network.nodeUrl, [id && `perp_events:${id}`, id && `trades:${id}`], trades.refresh, 1_000)
  // Mark and oracle prices move with most blocks; the header need not follow faster than this.
  useNodeStream(network.nodeUrl, [id && `perp_markets:${id}`], market.refresh, 2_000)
  const account = useAccount()
  const w = useWallet()
  const { trading } = useFeatures()
  const [picked, setPicked] = useState<string | null>(null)
  const [pickedTrigger, setPickedTrigger] = useState<{ price: string; at: number } | null>(null)
  const [mobileTab, setMobileTab] = useState<'chart' | 'book' | 'trades'>('chart')
  const [sideTab, setSideTab] = useState<'book' | 'trades'>('book')
  const now = useNow()

  const m = market.data
  if (market.error && !m) return <PairError error={market.error} kind="perp" />
  if (!m) return <TerminalSkeleton />

  const ref = Number(m.markPrice ?? m.oraclePrice ?? 1)
  const oracleAge = m.oracleTime ? Math.round(now - m.oracleTime) : null
  const positions = Object.values(account.data?.perp?.positions ?? {}).filter((p) => Number(p.size) !== 0).length

  const bookPanel = (
    <OrderBookPanel book={book.data} error={book.error} baseSymbol={m.base} quoteSymbol={m.quote} onPick={setPicked} mark={m.markPrice} />
  )
  const tradesPanel = <TradesPanel data={trades.data} error={trades.error} baseSymbol={m.base} quoteSymbol={m.quote} />

  const stats: HeaderStat[] = [
    {
      label: 'Oracle',
      value: (
        <>
          {fmtPrice(m.oraclePrice, ref)}
          {oracleAge !== null && oracleAge > 120 ? <span className="ml-1 text-warn">({oracleAge}s old)</span> : null}
        </>
      ),
      title: 'Stake-weighted median of validator votes',
    },
    { label: 'Index', value: m.indexPrice ? fmtPrice(m.indexPrice, ref) : '—', title: m.indexSource ? `${m.indexSource} reference` : undefined },
    { label: '24h change', value: percent(m.change24h), className: tone(m.change24h) },
    { label: `24h volume (${m.quote})`, value: compact(m.volume24h) },
    { label: 'Open interest', value: m.openInterest ? `${fixed(m.openInterest, 3)} ${m.base}` : '—' },
    {
      label: 'Funding / countdown',
      value: (
        <>
          <span className={tone(m.fundingRate)}>{m.fundingRate ? `${(Number(m.fundingRate) * 100).toFixed(4)}%` : '—'}</span>
          <span className="ml-2 text-muted-foreground">{countdown(m.nextFundingTime, now)}</span>
        </>
      ),
    },
  ]

  return (
    <div className="flex min-h-full flex-col gap-1 bg-canvas lg:h-full lg:p-1">
      <MarketHeader
        path={m.path}
        alertLabel={`${m.base}-${m.quote}`}
        alertUnit={m.quote}
        selector={
          <MarketSelector label={`${m.base}-${m.quote}`} sub={`Perpetual · up to ${m.maxLeverage ? Number(m.maxLeverage) : '—'}×`}>
            <TokenBadge asset={m.baseAsset ?? { symbol: m.base, color: '#64748b', verified: true }} size="lg" />
          </MarketSelector>
        }
        price={fmtPrice(m.markPrice, ref)}
        priceRaw={m.markPrice}
        priceClass={tone(m.change24h)}
        priceSub="mark price"
        stats={stats}
        right={
          slot === 'test' ? (
            <Link
              href="/perps/new"
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New market
            </Link>
          ) : null
        }
      />

      {m.collateralToken === '' && (
        <Notice>
          Perps on {network.name} cannot take deposits yet: its nodes have no collateral asset configured (the node setting{' '}
          <code className="font-mono">QRDX_PERP_COLLATERAL_TOKEN</code>). Every order needs collateral, so this market cannot trade until it is set.
        </Notice>
      )}
      {!m.oraclePrice && (
        <Notice>
          No oracle price yet: validators have not voted a {m.base} price, so the market refuses new positions. It opens once the committee
          prices it.
        </Notice>
      )}

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
          <PriceChart
            basePath={api}
            watermark={`${m.base}-PERP`}
            drawing={{
              id: `${slot}:${m.path}`,
              usePrice: setPicked,
              ...(trading
                ? (() => {
                    const p = account.data?.perp?.positions?.[m.id]
                    if (!p || Number(p.size) === 0 || !w.trader) return { useTrigger: (price: string) => setPickedTrigger({ price, at: Date.now() }) }
                    const long = Number(p.size) > 0
                    // The level becomes the position's TP/SL: a new one replaces the waiting one of its kind.
                    return {
                      placeTrigger: async (kind: 'tp' | 'sl', level: string) => {
                        // A drawn level, onto the market's price grid.
                        const price = gridPrice(level, m.szDecimals)
                        const e = protectiveLegError(long, kind, price, p.mark_price)
                        if (e) return e
                        const waiting = (account.data?.triggers ?? []).find((t) => t.kindOf === 'perp' && t.market === m.id && t.size === 'position' && t.kind === kind)
                        const place = {
                          op: 'PERP_TRIGGER',
                          params: { market_id: m.id, side: long ? 'sell' : 'buy', kind, trigger_price: price, position: true, reduce_only: true },
                          gasLimit: triggerGas() + 60_000,
                          label: `${kind === 'tp' ? 'Take profit' : 'Stop loss'} ${m.id} @ ${price}`,
                          market: m.id,
                        }
                        if (waiting) {
                          await w.sendExchangeBatch({
                            ops: [{ op: 'PERP_CANCEL', params: { market_id: m.id, order_id: waiting.orderId } }, place],
                            label: `Move ${m.id} ${kind === 'tp' ? 'take profit' : 'stop loss'} to ${price}`,
                            market: m.id,
                          })
                        } else await w.sendExchange(place)
                        return `Submitted: the position's ${kind === 'tp' ? 'take profit' : 'stop loss'} at ${price}. It closes the whole position when the mark gets there.`
                      },
                    }
                  })()
                : {}),
              alert: { path: m.path, label: `${m.base}-${m.quote}`, slot },
              unit: m.quote,
              levels: [
                ...(account.data?.perp?.orders ?? [])
                  .filter((o) => o.market_id === m.id)
                  .map((o) => ({
                    key: `o:${o.order_id}`,
                    price: Number(o.price),
                    label: `${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.remaining} @ ${fmtPrice(o.price, ref)}`,
                    tone: (o.side === 'buy' ? 'bid' : 'ask') as 'bid' | 'ask',
                  })),
                ...(account.data?.triggers ?? [])
                  .filter((t) => t.kindOf === 'perp' && t.market === m.id)
                  .map((t) => ({
                    key: `t:${t.orderId}`,
                    price: Number(t.triggerPrice),
                    label: `${t.kind === 'tp' ? 'TP' : 'SL'} ${t.size === 'position' ? 'position' : t.size} @ ${fmtPrice(t.triggerPrice, ref)}`,
                    tone: (t.kind === 'tp' ? 'bid' : 'ask') as 'bid' | 'ask',
                  })),
              ],
              position: (() => {
                const p = account.data?.perp?.positions?.[m.id]
                return p && Number(p.size) !== 0 ? { size: Number(p.size), entry: Number(p.entry_price), liquidation: p.liquidation_price ? Number(p.liquidation_price) : null } : null
              })(),
            }}
          />
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
              <PerpOrderForm market={m} book={book.data} account={account.data} pickedPrice={picked} pickedTrigger={pickedTrigger} />
            </TradeGate>
          </div>
        </Panel>
        <Panel className="min-h-[260px] lg:col-span-2 lg:min-h-0">
          <AccountPanel
            tabs={[
              { id: 'positions', label: `Positions${positions ? ` (${positions})` : ''}`, render: () => <PositionsTable account={account.data} /> },
              {
                id: 'orders',
                label: `Open orders${account.data?.perp?.orders.length ? ` (${account.data.perp.orders.length})` : ''}`,
                render: () => <PerpOrdersTable account={account.data} />,
              },
              // Only on a node with trigger orders and TWAPs (null otherwise).
              ...(account.data?.triggers
                ? [
                    {
                      id: 'triggers',
                      label: `TP / SL${(() => {
                        const n = account.data.triggers.filter((t) => t.kindOf === 'perp').length
                        return n ? ` (${n})` : ''
                      })()}`,
                      render: () => <TriggersTable account={account.data} kindOf="perp" />,
                    },
                  ]
                : []),
              ...(account.data?.twaps?.some((t) => t.perp)
                ? [{ id: 'twaps', label: `TWAP (${account.data.twaps.filter((t) => t.perp).length})`, render: () => <TwapsTable account={account.data} perp /> }]
                : []),
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b border-warn/30 bg-warn/10 px-3 py-2 text-xs lg:rounded-lg lg:border">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
      <span>{children}</span>
    </div>
  )
}
