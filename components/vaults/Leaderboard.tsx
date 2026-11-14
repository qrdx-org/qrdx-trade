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
  { id: 'day', label: '24H', span: '24 hours' },
  { id: 'week', label: '7D', span: '7 days' },
  { id: 'month', label: '30D', span: '30 days' },
  { id: 'all', label: 'All time', span: '' },
] as const

const METRICS = [
  { id: 'pnl', label: 'Profit' },
  { id: 'volume', label: 'Volume' },
] as const

/** Perps accounts ranked by realized PnL net of fees, or by volume (history_getLeaderboard). */
export function Leaderboard() {
  const { apiBase, network } = useNet()
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
    <main>
      <section className="hero-glow border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-4 px-4 pb-8 pt-10">
          <div className="mr-auto">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" aria-hidden /> Perpetuals · {network.name}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Leaderboard</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Perps traders by realized profit net of fees, or by volume, from the node&apos;s trading history. Open positions do not count until they close.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Segmented<(typeof WINDOWS)[number]['id']> options={WINDOWS} value={window} onChange={setWindow} label="Window" />
            <Segmented<'pnl' | 'volume'> options={METRICS} value={metric} onChange={setMetric} label="Rank by" />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-8">
      {known && !history ? (
        <Empty title="No trading history on this network" text={`The ${network.name} node does not keep a trading history, so there is nothing to rank.`} />
      ) : !board.data ? (
        board.error ? (
          <Empty title="Leaderboard unavailable" text={board.error.message} />
        ) : (
          <div className="space-y-2" aria-busy>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        )
      ) : !rows.length ? (
        <Empty
          title={`No perps trades ${window === 'all' ? 'yet' : `in the last ${WINDOWS.find((x) => x.id === window)!.span}`}`}
          text="Ranks appear with the first closed trade. Every fill on a perpetual counts, whoever makes it."
          action={{ href: '/perps', label: 'Trade perpetuals' }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="num w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="text-right">
                <th className="w-12 px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Trader</th>
                <th className="px-4 py-3 font-medium">Profit</th>
                <th className="px-4 py-3 font-medium">Volume</th>
                <th className="px-4 py-3 font-medium">Trades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const me = !!w.trader && r.account.toLowerCase() === w.trader.toLowerCase()
                return (
                  <tr key={r.account} className={cn('border-t text-right', me && 'bg-primary/5')}>
                    <td className="px-4 py-3 text-left text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs">
                      <Link href={`/portfolio?address=${r.account}`} className="hover:underline">
                        {r.account.slice(0, 10)}…{r.account.slice(-6)}
                      </Link>
                      {me && <span className="ml-2 rounded bg-primary/15 px-1 font-sans text-[10px] text-primary">you</span>}
                    </td>
                    <td className={cn('px-4 py-3', r.pnl > 0 ? 'text-bid' : r.pnl < 0 ? 'text-ask' : '')}>{`${r.pnl > 0 ? '+' : ''}${compact(r.pnl)}`}</td>
                    <td className="px-4 py-3">{compact(r.volume)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.trades}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </main>
  )
}

function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border bg-card p-0.5">
      {options.map((x) => (
        <button
          key={x.id}
          type="button"
          aria-pressed={value === x.id}
          onClick={() => onChange(x.id)}
          className={cn('rounded-md px-3 py-1.5 font-medium transition-colors', value === x.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {x.label}
        </button>
      ))}
    </div>
  )
}

function Empty({ title, text, action }: { title: string; text: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-xl border bg-card px-6 py-14 text-center">
      <Trophy className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      {action && (
        <Link href={action.href} className="mt-5 inline-block rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          {action.label}
        </Link>
      )}
    </div>
  )
}
