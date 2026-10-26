'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { compact } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

const WINDOWS = [
  { id: 'day', label: '24H' },
  { id: 'week', label: '7D' },
  { id: 'month', label: '30D' },
  { id: 'all', label: 'All time' },
] as const

/** Perps accounts ranked by realized PnL net of fees, or by volume (history_getLeaderboard). */
export function Leaderboard() {
  const { apiBase } = useNet()
  const w = useWallet()
  const { history, known } = useFeatures()
  const [window, setWindow] = useState<(typeof WINDOWS)[number]['id']>('week')
  const [metric, setMetric] = useState<'pnl' | 'volume'>('pnl')
  const board = useApi<{ rows: { account: string; pnl: number; volume: number; trades: number }[] }>(
    history ? `${apiBase}/leaderboard?window=${window}&metric=${metric}&limit=100` : null,
    30_000
  )
  const rows = board.data?.rows ?? []
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
        <Trophy className="h-7 w-7 text-muted-foreground" /> Leaderboard
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Perps traders by realized profit net of fees, or by volume, from the node&apos;s trading history. Open positions do not count until they close.</p>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
        {WINDOWS.map((x) => (
          <button key={x.id} type="button" onClick={() => setWindow(x.id)} className={cn('rounded-md border px-2.5 py-1', window === x.id ? 'border-foreground/60 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {x.label}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        {(['pnl', 'volume'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMetric(m)} className={cn('rounded-md border px-2.5 py-1', metric === m ? 'border-foreground/60 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {m === 'pnl' ? 'Profit' : 'Volume'}
          </button>
        ))}
      </div>
      {known && !history ? (
        <p className="mt-6 rounded-lg border p-6 text-center text-sm text-muted-foreground">This network&apos;s node keeps no trading history.</p>
      ) : !board.data ? (
        <p className="mt-6 p-6 text-center text-sm text-muted-foreground">{board.error ? board.error.message : 'Loading…'}</p>
      ) : !rows.length ? (
        <p className="mt-6 rounded-lg border p-6 text-center text-sm text-muted-foreground">No perps trades in this window yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
          <table className="num w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-right">
                <th className="w-12 px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Trader</th>
                <th className="px-4 py-2 font-medium">Profit</th>
                <th className="px-4 py-2 font-medium">Volume</th>
                <th className="px-4 py-2 font-medium">Trades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const me = !!w.trader && r.account.toLowerCase() === w.trader.toLowerCase()
                return (
                  <tr key={r.account} className={cn('border-t text-right', me && 'bg-primary/5')}>
                    <td className="px-4 py-2 text-left text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs">
                      <Link href={`/portfolio?address=${r.account}`} className="hover:underline">
                        {r.account.slice(0, 10)}…{r.account.slice(-6)}
                      </Link>
                      {me && <span className="ml-2 rounded bg-primary/15 px-1 font-sans text-[10px] text-primary">you</span>}
                    </td>
                    <td className={cn('px-4 py-2', r.pnl > 0 ? 'text-bid' : r.pnl < 0 ? 'text-ask' : '')}>{`${r.pnl > 0 ? '+' : ''}${compact(r.pnl)}`}</td>
                    <td className="px-4 py-2">{compact(r.volume)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.trades}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
