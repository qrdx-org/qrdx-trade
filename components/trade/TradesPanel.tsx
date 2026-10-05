'use client'

import { clock, price as fmtPrice, size as fmtSize } from '@/lib/format'
import type { TradesResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Recent executions, newest first. */
export function TradesPanel({
  data,
  error,
  baseSymbol,
  quoteSymbol,
  note,
}: {
  data: TradesResponse | null
  error: Error | null
  baseSymbol: string
  quoteSymbol: string
  note?: string
}) {
  const ref = Number(data?.trades[0]?.price ?? 1)
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 px-2 py-1 text-right text-[11px] text-muted-foreground">
        <span className="text-left">Price ({quoteSymbol})</span>
        <span>Size ({baseSymbol})</span>
        <span>Time</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && !data ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">Trades unavailable: the QRDX node did not answer.</p>
        ) : !data ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">Loading…</p>
        ) : data.trades.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">No trades yet.</p>
        ) : (
          data.trades.map((t) => (
            <div key={t.id} className="grid grid-cols-3 px-2 py-[1px] text-right text-xs tabular" title={t.txHash ?? undefined}>
              <span className={cn('text-left', t.side === 'buy' ? 'text-bid' : 'text-ask')}>
                {fmtPrice(t.price, ref)}
                {t.liquidation ? ' ⚡' : ''}
              </span>
              <span>{fmtSize(t.size)}</span>
              <span className="text-muted-foreground">{clock(t.time)}</span>
            </div>
          ))
        )}
      </div>
      {note && <p className="border-t px-2 py-1 text-[10px] leading-tight text-muted-foreground">{note}</p>}
    </div>
  )
}
