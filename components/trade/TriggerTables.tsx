'use client'

import Link from 'next/link'
import { useState } from 'react'
import { fixed, price as fmtPrice, size as fmtSize } from '@/lib/format'
import type { AccountResponse, AccountTrigger } from '@/lib/types'
import type { ExchangeRequest } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'
import { AmendOrder, CancelAll, useSequence } from '@/components/trade/OrderManage'

/** Seconds from now to a block time. */
const secondsUntil = (blockTime: string) => Math.max(0, Math.round(Number(blockTime) - Date.now() / 1000))

const KIND: Record<string, string> = { sl: 'Stop', tp: 'Take profit', oco: 'Stop / TP' }

/** Cancelling a trigger: PERP_CANCEL for a perps one, CANCEL_ORDER (refunding its escrow) for spot. */
export function cancelTriggerReq(t: AccountTrigger): ExchangeRequest {
  return t.kindOf === 'perp'
    ? { op: 'PERP_CANCEL', params: { market_id: t.market, order_id: t.orderId }, label: `Cancel ${KIND[t.kind] ?? t.kind} ${t.market} @ ${t.triggerPrice}`, market: t.market }
    : { op: 'CANCEL_ORDER', params: { order_id: t.orderId, pair: t.pair! }, label: `Cancel ${KIND[t.kind] ?? t.kind} ${t.market} @ ${t.triggerPrice}`, market: t.market }
}

/**
 * Waiting stop-loss / take-profit orders (perp_getTriggers): perps ones on the mark price,
 * spot ones on the pair's last trade. Shown only on a node with trigger orders.
 */
export function TriggersTable({ account, kindOf, onlyMarket }: { account: AccountResponse | null; kindOf: 'perp' | 'spot'; onlyMarket?: string }) {
  const seq = useSequence()
  const [busy, setBusy] = useState<string | null>(null)
  if (!account) return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
  const rows = (account.triggers ?? []).filter((t) => t.kindOf === kindOf && (!onlyMarket || t.market === onlyMarket))
  if (!rows.length) return <p className="p-6 text-center text-xs text-muted-foreground">No stop or take-profit orders{onlyMarket ? ' on this market' : ''}.</p>
  const go = async (key: string, reqs: ExchangeRequest[], label?: string) => {
    setBusy(key)
    await seq.run(reqs, label)
    setBusy(null)
  }
  // A perps trigger's price changes in place (PERP_MODIFY); the size of a position's TP/SL follows the position.
  const modify = (t: AccountTrigger, trigger: string, size: string) =>
    go(t.orderId, [
      {
        op: 'PERP_MODIFY',
        params: { market_id: t.market, order_id: t.orderId, trigger_price: trigger, ...(t.size !== 'position' && size ? { size } : {}) },
        label: `Move ${KIND[t.kind] ?? t.kind} ${t.market} to ${trigger}`,
        market: t.market,
      },
    ])
  return (
    <>
      {(seq.error || rows.length > 1) && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5">
          <span className="text-xs text-ask">{seq.error}</span>
          <CancelAll count={rows.length} noun="triggers" busy={busy === '*' ? seq.progress : null} onConfirm={() => void go('*', rows.map(cancelTriggerReq), `Cancel ${rows.length} triggers`)} />
        </div>
      )}
      <table className="num w-full text-xs">
        <thead className="text-[11px] text-muted-foreground">
          <tr className="text-right">
            <th className="px-3 py-1.5 text-left font-medium">Market</th>
            <th className="px-3 py-1.5 text-left font-medium">Type</th>
            <th className="px-3 py-1.5 text-left font-medium">Side</th>
            <th className="px-3 py-1.5 font-medium">Trigger</th>
            <th className="px-3 py-1.5 font-medium">Then</th>
            <th className="px-3 py-1.5 font-medium">Size</th>
            <th className="px-3 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.orderId} className="border-t text-right">
              <td className="px-3 py-1.5 text-left">{t.path ? <Link href={t.path} className="hover:underline">{t.market}</Link> : t.market}</td>
              <td className="px-3 py-1.5 text-left">{KIND[t.kind] ?? t.kind}</td>
              <td className={cn('px-3 py-1.5 text-left capitalize', t.side === 'buy' ? 'text-bid' : 'text-ask')}>{kindOf === 'perp' ? (t.side === 'buy' ? 'Buy' : 'Sell') : t.side}</td>
              <td className="px-3 py-1.5">{fmtPrice(t.triggerPrice)}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{t.limitPrice ? `limit ${fmtPrice(t.limitPrice)}` : 'market'}</td>
              <td className="px-3 py-1.5">{t.size === 'position' ? 'Position' : `${fmtSize(t.size)}${t.base ? ` ${t.base.symbol}` : ''}`}</td>
              <td className="relative px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  {t.kindOf === 'perp' && t.kind !== 'oco' && (
                    <AmendOrder
                      price={t.triggerPrice}
                      size={t.size === 'position' ? '' : t.size}
                      priceLabel="Trigger price"
                      sizeLabel="Size"
                      noSize={t.size === 'position'}
                      busy={!!busy}
                      onSubmit={(p, sz) => void modify(t, p, sz)}
                    />
                  )}
                  <button onClick={() => void go(t.orderId, [cancelTriggerReq(t)])} disabled={!!busy} className="rounded-md border px-2.5 py-0.5 text-[11px] font-medium hover:border-ask/50 hover:text-ask disabled:opacity-50">
                    {busy === t.orderId ? '…' : 'Cancel'}
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** TWAPs in progress (perp_getTwaps), perps or spot. */
export function TwapsTable({ account, perp }: { account: AccountResponse | null; perp: boolean }) {
  const seq = useSequence()
  const [busy, setBusy] = useState<string | null>(null)
  if (!account) return <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
  const rows = (account.twaps ?? []).filter((t) => t.perp === perp)
  if (!rows.length) return <p className="p-6 text-center text-xs text-muted-foreground">No TWAPs running.</p>
  return (
    <>
      {seq.error && <p className="px-3 py-1 text-xs text-ask">{seq.error}</p>}
      <table className="num w-full text-xs">
        <thead className="text-[11px] text-muted-foreground">
          <tr className="text-right">
            <th className="px-3 py-1.5 text-left font-medium">Market</th>
            <th className="px-3 py-1.5 text-left font-medium">Side</th>
            <th className="px-3 py-1.5 font-medium">Done</th>
            <th className="px-3 py-1.5 font-medium">Slices</th>
            <th className="px-3 py-1.5 font-medium">Next</th>
            <th className="px-3 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const next = secondsUntil(t.nextTime)
            return (
              <tr key={t.twapId} className="border-t text-right">
                <td className="px-3 py-1.5 text-left">{t.perp ? t.market : `${t.tokenIn?.symbol ?? '?'} → ${t.tokenOut?.symbol ?? '?'}`}</td>
                <td className={cn('px-3 py-1.5 text-left', t.side === 'sell' ? 'text-ask' : 'text-bid')}>
                  {t.perp ? (t.side === 'buy' ? 'Buy' : 'Sell') : 'Swap'}
                  {t.reduceOnly ? ' · reduce' : ''}
                </td>
                <td className="px-3 py-1.5">
                  {fmtSize(t.done)} / {fmtSize(t.total)}
                  {!t.perp && t.tokenOut && <span className="block text-[10px] text-muted-foreground">got {fixed(t.received, 6)} {t.tokenOut.symbol}</span>}
                </td>
                <td className="px-3 py-1.5">
                  {t.slicesDone} / {t.slices}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{next ? `${next}s` : 'this block'}</td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={async () => {
                      setBusy(t.twapId)
                      await seq.run([{ op: 'TWAP_CANCEL', params: { twap_id: t.twapId }, label: `Stop TWAP ${t.market}`, market: t.market }])
                      setBusy(null)
                    }}
                    disabled={!!busy}
                    className="rounded-md border px-2.5 py-0.5 text-[11px] font-medium hover:border-ask/50 hover:text-ask disabled:opacity-50"
                  >
                    {busy === t.twapId ? '…' : 'Stop'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
