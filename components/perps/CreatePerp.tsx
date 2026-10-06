'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, Gauge, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { TradeGate } from '@/components/trade/TradeGate'
import { VERIFIED_ASSETS } from '@/lib/assets'
import { compact, price as fmtPrice, usd } from '@/lib/format'
import { apiGet, useApi, useDebounced } from '@/lib/hooks/useApi'
import type { PerpMarket } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

interface Check {
  base: string
  quote: string
  marketId: string
  exists: boolean
  path: string
  nodeOk: boolean
  oracle: { underlying: string; price: string | null; sources: { source: string; price: string }[] }
}

const LEVERAGE = [3, 5, 10, 20]
const MAX_LEVERAGE = 20

type Stage = 'signing' | 'block' | 'created' | 'priced' | 'failed'

/**
 * Create a perpetual market (CREATE_MARKET). Open to anyone on the chain; the
 * site offers it on testnet. A market trades once the validator committee votes
 * its oracle price, which they take from public USD spot prices of its base, so
 * the form checks that first.
 */
export function CreatePerp() {
  const { slot, setSlot, apiBase, network } = useNet()
  const w = useWallet()
  const perps = useApi<{ perps: PerpMarket[] }>(`${apiBase}/perps`, 10_000)
  const [base, setBase] = useState('')
  const [lev, setLev] = useState(10)
  const [stage, setStage] = useState<Stage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ marketId: string; path: string; tx: string } | null>(null)

  const sym = base.trim()
  const valid = /^[A-Za-z0-9]{1,12}$/.test(sym)
  const debounced = useDebounced(sym, 400)
  const check = useApi<Check>(valid && debounced === sym ? `${apiBase}/perps/check?base=${encodeURIComponent(sym)}` : null, 30_000)
  const c = check.data && check.data.base === sym ? check.data : null

  const taken = useMemo(() => new Set((perps.data?.perps ?? []).map((m) => m.base.toUpperCase())), [perps.data])
  const suggestions = VERIFIED_ASSETS.filter((a) => !a.usdStable && a.slug !== 'qrdx' && !taken.has(a.symbol.toUpperCase()))

  const problem = !sym
    ? 'Choose an asset'
    : !valid
      ? '1–12 letters or digits'
      : !c
        ? 'Checking…'
        : c.exists
          ? `${c.marketId} exists`
          : !c.nodeOk
            ? 'The QRDX node is unreachable'
            : null

  const create = async () => {
    if (problem || !c) return
    setError(null)
    setStage('signing')
    try {
      const { txHash } = await w.sendExchange({
        op: 'CREATE_MARKET',
        params: { base_token: c.base, max_leverage: String(lev) },
        label: `Create ${c.marketId} (up to ${lev}×)`,
        market: c.marketId,
      })
      setCreated({ marketId: c.marketId, path: c.path, tx: txHash })
      setStage('block')
    } catch (e) {
      setError((e as Error).message)
      setStage(null)
    }
  }

  // After signing: the receipt, then the market's first oracle price.
  useEffect(() => {
    if (!created || stage === 'priced' || stage === 'failed') return
    const ctrl = new AbortController()
    const t = setInterval(async () => {
      try {
        if (stage === 'block') {
          const r = await apiGet<{ success: boolean; error: string }>(`${apiBase}/receipts/${created.tx}`, ctrl.signal).catch(() => null)
          if (!r) return
          if (!r.data.success) {
            setError(r.data.error || 'The node refused the market.')
            setStage('failed')
          } else {
            setStage('created')
            perps.refresh()
          }
        } else if (stage === 'created') {
          const m = await apiGet<PerpMarket>(`${apiBase}${created.path}`, ctrl.signal).catch(() => null)
          if (m?.data.oraclePrice) setStage('priced')
        }
      } catch {
        /* keep polling */
      }
    }, 4_000)
    return () => {
      clearInterval(t)
      ctrl.abort()
    }
  }, [created, stage, apiBase]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main>
      <section className="hero-glow border-b">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" /> Perpetuals · {slot === 'test' ? network.name : 'Testnet only'}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Create a perpetual market</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Open an order book for leveraged longs and shorts on any asset the validators can price. The market settles in
            perps collateral, marks to the validators&apos; oracle price, and pays funding between longs and shorts.
          </p>
        </div>
      </section>

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {slot !== 'test' ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-background">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Creating markets is open on testnet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Try a new perpetual on test tokens first. Switch the site to testnet; with a wallet connected, the wallet asks to switch too.
            </p>
            <Button className="mt-5" onClick={() => void setSlot('test')}>
              Switch to testnet
            </Button>
          </div>
        ) : created && stage ? (
          <Progress created={created} stage={stage} error={error} lev={lev} onReset={() => (setCreated(null), setStage(null), setBase(''))} />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <TradeGate action="create a market">
              <div className="space-y-6 p-5">
                <Step n={1} title="Underlying asset" hint="The symbol validators look up, priced in USD. A bridged qBTC is priced as BTC.">
                  <div className="relative">
                    <input
                      value={base}
                      onChange={(e) => setBase(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12))}
                      placeholder="SOL"
                      aria-label="Underlying asset symbol"
                      className="num h-12 w-full rounded-lg border bg-background px-4 pr-28 text-lg font-semibold uppercase tracking-wide outline-none transition-colors placeholder:normal-case placeholder:text-muted-foreground/50 focus:border-foreground/30"
                    />
                    {c && <span className="num absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">{c.marketId}</span>}
                  </div>
                  {suggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {suggestions.map((a) => (
                        <button
                          key={a.slug}
                          onClick={() => setBase(a.symbol)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-colors',
                            sym.toUpperCase() === a.symbol ? 'border-foreground/40 bg-accent' : 'hover:bg-accent'
                          )}
                        >
                          <TokenBadge asset={{ symbol: a.symbol, color: a.color, verified: true, slug: a.slug }} size="sm" />
                          {a.symbol}
                        </button>
                      ))}
                    </div>
                  )}
                  {valid && <OracleStatus check={c} loading={!c && !check.error} />}
                </Step>

                <Step n={2} title="Maximum leverage" hint="Sets the margins: initial margin is 1 ÷ leverage, maintenance half of that.">
                  <div className="flex items-center gap-4">
                    <div className="grid flex-1 grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                      {LEVERAGE.map((l) => (
                        <button
                          key={l}
                          onClick={() => setLev(l)}
                          className={cn('rounded-md py-1.5 text-sm font-semibold transition-colors', lev === l ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                        >
                          {l}×
                        </button>
                      ))}
                    </div>
                    <span className="num w-14 text-right text-2xl font-semibold">{lev}×</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={MAX_LEVERAGE}
                    value={lev}
                    onChange={(e) => setLev(Number(e.target.value))}
                    aria-label="Maximum leverage"
                    className="mt-4 w-full accent-[hsl(var(--primary))]"
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Metric k="Initial margin" v={`${trim(100 / lev)}%`} />
                    <Metric k="Maintenance" v={`${trim(50 / lev)}%`} />
                    <Metric k="Liquidated at" v={`−${trim(100 / lev - 50 / lev)}%`} hint="Adverse move from entry, at full leverage" />
                  </div>
                </Step>

                <Step n={3} title="Review">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                    <Row k="Market">{c?.marketId ?? (sym ? `${sym}-USD-PERP` : '—')}</Row>
                    <Row k="Quoted in">{c?.quote ?? 'USD'}, settled in perps collateral</Row>
                    <Row k="Trading fees">0.02% maker · 0.05% taker</Row>
                    <Row k="Funding">Between longs and shorts, capped at ±1% per interval</Row>
                    <Row k="Cost to create">Gas only, about 0.0001 QRDX</Row>
                  </dl>
                </Step>

                {error && <p className="rounded-md bg-ask/10 px-3 py-2 text-sm text-ask">{error}</p>}
                <Button className="h-12 w-full text-base font-semibold" disabled={!!problem || stage === 'signing' || !w.rightNetwork} onClick={create}>
                  {stage === 'signing' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirm in wallet…
                    </>
                  ) : problem ? (
                    problem
                  ) : (
                    <>
                      Create {c!.base}-{c!.quote} market <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </TradeGate>
          </div>
        )}

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold">Live perpetuals</h3>
            <div className="mt-2 space-y-0.5">
              {(perps.data?.perps ?? []).map((m) => (
                <Link key={m.id} href={m.path} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <span className="flex items-center gap-2">
                    <TokenBadge asset={m.baseAsset ?? { symbol: m.base, color: '#64748b', verified: true }} size="sm" />
                    <span className="font-medium">{m.base}-{m.quote}</span>
                  </span>
                  <span className="num text-xs text-muted-foreground">
                    {m.markPrice ? fmtPrice(m.markPrice) : 'unpriced'} · OI {compact(m.openInterest)}
                  </span>
                </Link>
              ))}
              {perps.data && !perps.data.perps.length && <p className="px-2 py-3 text-xs text-muted-foreground">None yet. Yours would be the first.</p>}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold">How a new market starts</h3>
            <ol className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">
              <li>
                <b className="text-foreground">1. Created in the next block.</b> The order book exists from then on; anyone can place orders.
              </li>
              <li>
                <b className="text-foreground">2. Priced by validators.</b> The committee votes the asset&apos;s USD price each block; the
                stake-weighted median becomes the oracle and mark.
              </li>
              <li>
                <b className="text-foreground">3. Trades and funds.</b> Longs and shorts match on the book; funding moves the mark toward the
                oracle.
              </li>
            </ol>
          </div>
        </aside>
      </div>
    </main>
  )
}

function OracleStatus({ check, loading }: { check: Check | null; loading: boolean }) {
  if (loading || !check)
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking public prices…
      </p>
    )
  if (check.exists)
    return (
      <div className="mt-3 flex items-center justify-between rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warn" /> {check.marketId} already exists.
        </span>
        <Link href={check.path} className="font-medium hover:underline">
          Trade it →
        </Link>
      </div>
    )
  const o = check.oracle
  return o.price ? (
    <div className="mt-3 rounded-lg border border-bid/30 bg-bid/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-medium text-bid">
        <CheckCircle2 className="h-3.5 w-3.5" /> Validators can price {o.underlying}: {usd(o.price)}
      </div>
      <div className="mt-0.5 pl-[22px] text-muted-foreground">
        From {o.sources.map((s) => `${s.source} ${usd(s.price)}`).join(' · ')}. Validators vote the median of public exchanges.
      </div>
    </div>
  ) : (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
      <span>
        No public exchange lists {o.underlying} against USD, so validators will not vote a price. The market can be created, but it will not
        trade until one exists.
      </span>
    </div>
  )
}

function Progress({
  created,
  stage,
  error,
  lev,
  onReset,
}: {
  created: { marketId: string; path: string; tx: string }
  stage: Stage
  error: string | null
  lev: number
  onReset: () => void
}) {
  const order: Stage[] = ['signing', 'block', 'created', 'priced']
  const at = stage === 'failed' ? -1 : order.indexOf(stage)
  const steps = [
    { label: 'Signed and submitted', detail: `Transaction ${created.tx.slice(0, 12)}…` },
    { label: 'Included in a block', detail: 'Blocks are about 3 minutes apart.' },
    { label: 'Market created', detail: `${created.marketId}, up to ${lev}× leverage` },
    { label: 'First oracle price', detail: 'Validators vote it in their next blocks; then it trades.' },
  ]
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{stage === 'failed' ? 'The market was not created' : stage === 'priced' ? `${created.marketId} is live` : `Creating ${created.marketId}`}</h2>
      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => {
          const done = at > i || (stage === 'priced' && i === 3)
          const now = at === i
          return (
            <li key={s.label} className="flex gap-3">
              <span className="mt-0.5">
                {stage === 'failed' && i === 1 ? (
                  <XCircle className="h-5 w-5 text-ask" />
                ) : done ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bid text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : now ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40" />
                )}
              </span>
              <span>
                <span className={cn('block text-sm font-medium', !done && !now && 'text-muted-foreground')}>{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.detail}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {error && <p className="mt-4 rounded-md bg-ask/10 px-3 py-2 text-sm text-ask">{error}</p>}
      <div className="mt-6 flex gap-2">
        {(stage === 'created' || stage === 'priced') && (
          <Button asChild>
            <Link href={created.path}>
              Open {created.marketId} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
        <Button variant="outline" onClick={onReset}>
          Create another
        </Button>
      </div>
    </div>
  )
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">{n}</span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="pl-9">{children}</div>
    </section>
  )
}

function Metric({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="rounded-lg border px-2 py-2" title={hint}>
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="num text-sm font-semibold">{v}</div>
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="num text-right">{children}</dd>
    </>
  )
}

const trim = (x: number) => String(+x.toFixed(2))
