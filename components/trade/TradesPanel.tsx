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
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-3 px-3 pb-1.5 pt-3 text-right text-[11px] text-muted-foreground">
        <span className="text-left">Price ({quoteSymbol})</span>
        <span>Size ({baseSymbol})</span>
        <span>Time</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && !data ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">Trades unavailable: the QRDX node did not answer.</p>
        ) : !data ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">Loading…</p>
        ) : data.trades.length === 0 ? (
          <p className="px-6 py-10 text-center text-xs leading-relaxed text-muted-foreground">{note && data.available === false ? 'No trade feed on this network.' : 'No trades yet.'}</p>
        ) : (
          data.trades.map((t) => (
            <div key={t.id} className="grid h-[19px] grid-cols-3 items-center px-3 text-right text-xs num hover:bg-accent/60" title={t.txHash ?? undefined}>
              <span className={cn('text-left font-medium', t.side === 'buy' ? 'text-bid' : 'text-ask')}>
                {fmtPrice(t.price, ref)}
                {t.liquidation ? ' ⚡' : ''}
              </span>
              <span>{fmtSize(t.size)}</span>
              <span className="text-muted-foreground">{clock(t.time)}</span>
            </div>
          ))
        )}
      </div>
      {note && <p className="border-t px-3 py-2 text-[10px] leading-snug text-muted-foreground">{note}</p>}
    </div>
  )
}
