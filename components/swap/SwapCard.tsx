'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownUp, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { isTokenAddress } from '@/lib/assets'
import { dec, isAmount, lessSlippage, round } from '@/lib/decimal'
import { fixed, percent, size as fmtSize } from '@/lib/format'
import { useApi, useDebounced } from '@/lib/hooks/useApi'
import { useAccount } from '@/components/trade/SpotTradeView'
import type { ApiAsset } from '@/lib/types'
import type { RoutedQuote } from '@/lib/server/routing'
import { MAX_PATH_HOPS, routeOps, routePathOp } from '@/lib/routing'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

type AssetList = { assets: ApiAsset[]; tokens?: ApiAsset[] }

export function SwapCard() {
  const { apiBase } = useNet()
  const w = useWallet()
  const router = useRouter()
  const params = useSearchParams()
  const from = (params.get('from') ?? 'usdc').toLowerCase()
  const to = (params.get('to') ?? 'btc').toLowerCase()
  const list = useApi<AssetList>(`${apiBase}/assets?all=1`, 60_000)
  const account = useAccount()
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const all = useMemo(() => [...(list.data?.assets ?? []), ...(list.data?.tokens ?? [])], [list.data])
  const find = (seg: string) => all.find((a) => a.segment === seg || a.address === seg) ?? null
  const fromAsset = find(from)
  const toAsset = find(to)

  const setPair = (f: string, t: string) => router.replace(`/swap?from=${f}&to=${t}`)

  const debounced = useDebounced(amount, 350)
  const quotePath =
    isAmount(debounced) && dec(debounced) > 0n && from !== to
      ? `${apiBase}/quote/route?from=${from}&to=${to}&amount=${debounced}${w.trader ? `&sender=${w.trader}` : ''}`
      : null
  // The best route through up to three markets (lib/server/routing.ts); usually the pair itself.
  const q = useApi<RoutedQuote>(quotePath, 10_000)
  const hops = q.data?.hops ?? []
  const multi = hops.length > 1
  // One atomic SWAP through the path, where the node takes them.
  const { trading } = useFeatures()
  const atomic = multi && trading && hops.length <= MAX_PATH_HOPS

  const balance = (a: ApiAsset | null) => (a?.address && account.data?.balances.find((b) => b.asset.address === a.address)?.balance) || '0'
  const avail = balance(fromAsset)

  const problem = (() => {
    if (!fromAsset || !toAsset) return 'Choose two tokens.'
    if (!fromAsset.listed || !toAsset.listed) return `${!fromAsset.listed ? fromAsset.symbol : toAsset.symbol} is not on this network yet.`
    if (!isAmount(amount, fromAsset.decimals) || dec(amount) <= 0n) return 'Enter an amount.'
    if (w.trader && account.data && dec(amount) > dec(avail)) return `Not enough ${fromAsset.symbol}.`
    if (q.error) return q.error.message
    if (!q.data || debounced !== amount) return 'Getting a quote…'
    if (!(Number(slippage) > 0 && Number(slippage) <= 50)) return 'Slippage must be between 0 and 50 %.'
    return null
  })()

  const deadline = () => Math.floor(Date.now() / 1000) + 10 * 60
  // For the minimum shown; the operations signed get their deadline when they are built.
  const plan =
    q.data && multi && Number(slippage) > 0
      ? atomic
        ? routePathOp(q.data.hops, amount, Number(slippage), 0)
        : routeOps(q.data.hops, amount, Number(slippage), 0)
      : null
  const minOut = plan ? plan.minOut : q.data ? lessSlippage(q.data.amountOut, Number(slippage)) : null

  const submit = async () => {
    if (problem || !q.data || !fromAsset || !toAsset) return
    setBusy(true)
    setMsg(null)
    try {
      if (atomic) {
        const { op, minOut: least } = routePathOp(q.data.hops, amount, Number(slippage), deadline())
        const via = q.data.hops.slice(0, -1).map((h) => h.to.symbol).join(', ')
        await w.sendExchange({ ...op, gasLimit: 1_000_000, label: `Swap ${amount} ${fromAsset.symbol} → ≥ ${round(least, 8)} ${toAsset.symbol} through ${via}` })
        setAmount('')
        setMsg({ ok: true, text: `Submitted as one swap through ${via}: all of it or none. Track it in Portfolio.` })
        return
      }
      if (multi) {
        const { ops, minOut: least } = routeOps(q.data.hops, amount, Number(slippage), deadline())
        const via = q.data.hops.slice(0, -1).map((h) => h.to.symbol).join(', ')
        await w.sendExchangeBatch({ ops, label: `Swap ${amount} ${fromAsset.symbol} → ≥ ${round(least, 8)} ${toAsset.symbol} through ${via}` })
        setAmount('')
        setMsg({ ok: true, text: `Submitted as ${ops.length} swaps in one approval; a block applies them in order. Track them in Portfolio.` })
        return
      }
      await w.sendExchange({
        op: 'SWAP',
        params: {
          token_in: fromAsset.address,
          token_out: toAsset.address,
          // What the user typed; the quote's amountIn is what the route consumes.
          amount_in: amount,
          min_amount_out: minOut,
          venue: 'auto',
          deadline: deadline(),
        },
        label: `Swap ${amount} ${fromAsset.symbol} → ≥ ${round(minOut!, 8)} ${toAsset.symbol}`,
      })
      setAmount('')
      setMsg({ ok: true, text: 'Submitted. It executes when the next block includes it, usually within a second. Track it in Portfolio.' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hero-glow px-3 pb-6 pt-12">
      <div className="mx-auto mb-6 max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Swap</h1>
        <p className="mt-2 text-sm text-muted-foreground">Any two tokens on QRDX, routed to the best of the order book and the pools.</p>
      </div>
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-2 shadow-2xl shadow-black/5">
        <Side label="You pay" asset={fromAsset} balance={w.trader ? avail : null} onPick={() => setPicking('from')}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} inputMode="decimal" placeholder="0" className="num h-12 border-0 bg-transparent px-0 text-right text-3xl font-medium shadow-none focus-visible:ring-0 dark:bg-transparent" />
        </Side>
        <div className="relative z-10 -my-2 flex justify-center">
          <button onClick={() => setPair(to, from)} className="rounded-xl border-4 border-card bg-muted p-2 transition-transform hover:rotate-180 hover:bg-accent" aria-label="Flip">
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>
        <Side label="You receive (estimate)" asset={toAsset} balance={w.trader ? balance(toAsset) : null} onPick={() => setPicking('to')}>
          <div className={cn('num h-12 text-right text-3xl font-medium leading-[3rem]', q.data ? 'text-foreground' : 'text-muted-foreground')}>{q.data ? fmtSize(q.data.amountOut) : '0'}</div>
        </Side>

        <div className="mx-2 mt-3 space-y-1.5 text-xs">
          <Line k="Rate" v={q.data && fromAsset && toAsset ? `1 ${toAsset.symbol} = ${fixed(q.data.executionPrice, 6)} ${fromAsset.symbol}` : '—'} />
          <Line k="Minimum received" v={minOut && toAsset ? `${fmtSize(minOut)} ${toAsset.symbol}` : '—'} />
          <Line k="Price impact" v={q.data?.priceImpact ? percent(String(Number(q.data.priceImpact) * 100), false) : q.data ? 'n/a (order book)' : '—'} />
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">Route</span>
            {q.data ? (
              <span className="flex flex-wrap items-center justify-end gap-0.5 text-right">
                {hops.map((h, i) => (
                  <span key={i} className="inline-flex items-center gap-0.5">
                    {i === 0 && <span className="font-medium">{h.from.symbol}</span>}
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium" title={h.venue === 'clob' ? 'Order book' : `Pool ${h.poolId ?? ''}`}>
                      {h.to.symbol}
                    </span>
                  </span>
                ))}
                <span className="ml-1 text-muted-foreground">
                  {multi ? `${hops.length} hops` : hops[0]?.venue === 'clob' ? 'order book' : `pool ${hops[0]?.poolId?.slice(0, 8) ?? ''}`}
                </span>
              </span>
            ) : (
              <span>—</span>
            )}
          </div>
          <Line k="Fees" v={q.data ? hops.map((h) => `${fmtSize(h.fee)} ${h.from.symbol}`).join(' + ') : '—'} />
          {multi && q.data?.directAmountOut && (
            <p className="text-muted-foreground">
              {fmtSize(q.data.amountOut)} vs {fmtSize(q.data.directAmountOut)} {toAsset?.symbol} swapping directly.
            </p>
          )}
          {atomic && (
            <p className="leading-snug text-muted-foreground">
              One swap through {hops.length} markets: it delivers at least the minimum, or nothing happens and you keep your {fromAsset?.symbol}.
            </p>
          )}
          {multi && !atomic && (
            <p className="leading-snug text-muted-foreground">
              {hops.length} swaps, one approval. Each refuses to fill below its own minimum; if a later one does, you keep the {hops.slice(0, -1).map((h) => h.to.symbol).join(' / ')} the earlier ones
              bought. Up to {slippage} % of each in-between token can be left over.
            </p>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max slippage</span>
            <span>
              <input value={slippage} onChange={(e) => setSlippage(e.target.value)} className="num w-12 rounded border bg-background px-1 py-0.5 text-right" /> %
            </span>
          </div>

        </div>

        <div className="mx-2 mt-4">
          {!w.trader ? (
            <ConnectButton className="h-12 w-full text-base" />
          ) : (
            <Button className="h-12 w-full text-base font-semibold" disabled={!!problem || busy || !w.rightNetwork} onClick={submit}>
              {busy ? 'Confirm in wallet…' : problem && problem !== 'Getting a quote…' ? problem : 'Swap'}
            </Button>
          )}
        </div>
        {msg && <p className={cn('mx-2 mt-2 rounded-md px-2.5 py-2 text-xs', msg.ok ? 'bg-bid/10 text-bid' : 'bg-ask/10 text-ask')}>{msg.text}</p>}
        <p className="mx-2 mb-2 mt-3 text-[10px] leading-snug text-muted-foreground">
          Each swap goes to whichever of its pair&apos;s pools or order book pays the most, and when no direct market pays
          best, through up to two tokens in between. Every swap is refused if its output falls below its minimum. A gas fee
          of about 0.0001 QRDX is burned for each, either way.
        </p>
      </div>

      <TokenPicker
        open={picking !== null}
        assets={all}
        onClose={() => setPicking(null)}
        onPick={(a) => {
          if (picking === 'from') setPair(a.segment, a.segment === to ? from : to)
          else setPair(a.segment === from ? to : from, a.segment)
          setPicking(null)
        }}
      />
    </div>
  )
}

function Side({ label, asset, balance, onPick, children }: { label: string; asset: ApiAsset | null; balance: string | null; onPick: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/60 p-4">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {balance !== null && <span className="num">Balance {fmtSize(balance)}</span>}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button onClick={onPick} className="flex shrink-0 items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-2.5 text-sm font-semibold shadow-sm transition-colors hover:bg-accent">
          <TokenBadge asset={asset} size="md" />
          {asset?.symbol ?? 'Select'}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="flex-1">{children}</div>
      </div>
      {asset && !asset.verified && <p className="mt-1 text-[11px] text-warn">Unverified token · {asset.address}</p>}
    </div>
  )
}

export function TokenPicker({ open, assets, onClose, onPick }: { open: boolean; assets: ApiAsset[]; onClose: () => void; onPick: (a: ApiAsset) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = assets.filter((a) => !needle || a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) || a.address === needle)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogTitle className="sr-only">Select a token</DialogTitle>
        <div className="flex items-center gap-2 border-b p-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol, name or address" className="h-8 border-0 shadow-none focus-visible:ring-0" />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {rows.map((a) => (
            <button key={a.segment} onClick={() => onPick(a)} disabled={!a.listed} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent disabled:opacity-40">
              <TokenBadge asset={a} size="md" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{a.symbol}</span>
                <span className={cn('block truncate text-[11px]', a.verified ? 'text-muted-foreground' : 'text-warn')}>
                  {a.verified ? a.name : `Unverified · ${a.address}`}
                  {!a.listed && ' · not on this network'}
                </span>
              </span>
            </button>
          ))}
          {isTokenAddress(needle) && !rows.length && <p className="p-4 text-xs text-muted-foreground">No token at that address on this network.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="num">{v}</span>
    </div>
  )
}
