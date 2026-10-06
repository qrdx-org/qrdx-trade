'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { S, dec, div, isAmount, lessSlippage, mul, round, str } from '@/lib/decimal'
import { spotLimitParams } from '@/lib/orders'
import { fixed, percent, price as fmtPrice, size as fmtSize } from '@/lib/format'
import { useApi, useDebounced } from '@/lib/hooks/useApi'
import type { AccountResponse, OrderBook, SpotMarket, SwapQuote } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

type Side = 'buy' | 'sell'
type Kind = 'limit' | 'market'

/** Exchange gas a single spot operation burns, in QRDX (docs/PERPS_API.md §1). */
const GAS_NOTE = 'A gas fee of about 0.0001 QRDX is burned whether or not it fills.'

export function SpotOrderForm({
  market,
  book,
  account,
  pickedPrice,
}: {
  market: SpotMarket
  book: OrderBook | null
  account: AccountResponse | null
  pickedPrice: string | null
}) {
  const w = useWallet()
  const { apiBase } = useNet()
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<Kind>('limit')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { base, quote } = market
  const ref = Number(book?.mid ?? market.last ?? 1)

  useEffect(() => {
    if (pickedPrice) {
      setPrice(round(pickedPrice, 12))
      setKind('limit')
    }
  }, [pickedPrice])
  // Seed the limit price from the book once per market.
  useEffect(() => {
    setPrice('')
    setSize('')
    setAmountIn('')
    setMsg(null)
  }, [market.id])
  useEffect(() => {
    if (!price && book?.mid) setPrice(round(book.mid, Math.min(12, decimalsFor(ref))))
  }, [book?.mid, price, ref])

  const balanceOf = (address: string | null) =>
    (address && account?.balances.find((b) => b.asset.address === address)?.balance) || '0'
  const availQuote = balanceOf(quote.address)
  const availBase = balanceOf(base.address)
  const avail = side === 'buy' ? availQuote : availBase
  const availSym = side === 'buy' ? quote.symbol : base.symbol

  // ── market orders: a quoted SWAP ──
  const swapIn = useDebounced(amountIn, 350)
  const quotePath =
    kind === 'market' && isAmount(swapIn) && dec(swapIn) > 0n && base.address && quote.address
      ? `${apiBase}/quote?from=${side === 'buy' ? quote.segment : base.segment}&to=${side === 'buy' ? base.segment : quote.segment}` +
        `&amount=${swapIn}&venue=auto${w.trader ? `&sender=${w.trader}` : ''}`
      : null
  const q = useApi<SwapQuote>(quotePath, 10_000)

  const limitTotal = useMemo(() => {
    if (!isAmount(price) || !isAmount(size)) return null
    return str(mul(dec(price), dec(size)))
  }, [price, size])

  const problem = (() => {
    if (market.status !== 'live') return 'This pair has no on-chain market.'
    if (kind === 'limit') {
      if (!isAmount(price) || dec(price) <= 0n) return 'Enter a price.'
      if (!isAmount(size, base.decimals) || dec(size) <= 0n) return `Enter a size (up to ${base.decimals} decimals).`
      const need = side === 'buy' ? limitTotal! : size
      if (w.trader && account && dec(need) > dec(avail)) return `Not enough ${availSym}.`
    } else {
      const decimals = side === 'buy' ? quote.decimals : base.decimals
      if (!isAmount(amountIn, decimals) || dec(amountIn) <= 0n) return `Enter an amount (up to ${decimals} decimals).`
      if (w.trader && account && dec(amountIn) > dec(avail)) return `Not enough ${availSym}.`
      if (q.error) return q.error.message
      if (!q.data || swapIn !== amountIn) return 'Getting a quote…'
      const slip = Number(slippage)
      if (!(slip > 0 && slip <= 50)) return 'Slippage must be between 0 and 50 %.'
    }
    return null
  })()

  const setPct = (pct: number) => {
    const a = dec(avail)
    const part = (a * BigInt(pct)) / 100n
    if (kind === 'market') return setAmountIn(round(str(part), side === 'buy' ? quote.decimals : base.decimals, 'down'))
    if (side === 'sell') return setSize(round(str(part), base.decimals, 'down'))
    if (isAmount(price) && dec(price) > 0n) setSize(round(str(div(part, dec(price))), base.decimals, 'down'))
  }

  const submit = async () => {
    if (problem) return
    setBusy(true)
    setMsg(null)
    try {
      if (kind === 'limit') {
        await w.sendExchange({
          op: 'PLACE_ORDER',
          params: spotLimitParams(market, side, price, size),
          label: `${side === 'buy' ? 'Buy' : 'Sell'} ${size} ${base.symbol} @ ${price} ${quote.symbol}`,
          market: market.id,
        })
      } else {
        const quoteData = q.data!
        const [tin, tout] = side === 'buy' ? [quote, base] : [base, quote]
        await w.sendExchange({
          op: 'SWAP',
          params: {
            token_in: tin.address,
            token_out: tout.address,
            // What the user typed. The quote's amountIn is what the route consumes
            // (AMM rounding can leave dust unspent), not an amount to sign.
            amount_in: amountIn,
            min_amount_out: lessSlippage(quoteData.amountOut, Number(slippage)),
            venue: 'auto',
            // Block time; generous because blocks are minutes apart.
            deadline: Math.floor(Date.now() / 1000) + 30 * 60,
          },
          label: `Market ${side} · ${amountIn} ${tin.symbol} → ≥ ${round(lessSlippage(quoteData.amountOut, Number(slippage)), 8)} ${tout.symbol}`,
          market: market.id,
        })
      }
      setMsg({ ok: true, text: 'Submitted. It executes when the next block includes it (~3 min).' })
      setSize('')
      setAmountIn('')
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  // Market-order summary, oriented to the market.
  const avgPrice =
    q.data && dec(q.data.amountOut) > 0n
      ? side === 'buy'
        ? q.data.executionPrice
        : S.div(q.data.amountOut, q.data.amountIn)
      : null

  const setFromBook = (which: 'bid' | 'mid' | 'ask') => {
    const v = which === 'bid' ? book?.bestBid : which === 'ask' ? book?.bestAsk : book?.mid
    if (v) setPrice(round(v, Math.min(12, decimalsFor(ref))))
  }
  const accent = side === 'buy' ? 'bid' : 'ask'

  return (
    <div className="flex flex-1 flex-col gap-3.5 p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              'rounded-md py-1.5 font-semibold transition-all',
              side === s
                ? s === 'buy'
                  ? 'bg-bid text-white shadow-sm shadow-bid/30'
                  : 'bg-ask text-white shadow-sm shadow-ask/30'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 border-b text-[13px]">
        {(['limit', 'market'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn('relative pb-2 font-medium transition-colors', kind === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {k === 'limit' ? 'Limit' : 'Market'}
            {kind === k && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Available</span>
        <span className="num font-medium">{w.trader ? `${fmtSize(avail)} ${availSym}` : '—'}</span>
      </div>

      {kind === 'limit' ? (
        <>
          <Field
            label="Price"
            unit={quote.symbol}
            extra={
              book && (
                <span className="flex gap-1">
                  {(['bid', 'mid', 'ask'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        setFromBook(b)
                      }}
                      className="rounded px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {b}
                    </button>
                  ))}
                </span>
              )
            }
          >
            <Input value={price} onChange={(e) => setPrice(e.target.value.trim())} inputMode="decimal" className={INPUT} />
          </Field>
          <Field label="Size" unit={base.symbol}>
            <Input value={size} onChange={(e) => setSize(e.target.value.trim())} inputMode="decimal" placeholder="0.00" className={INPUT} />
          </Field>
        </>
      ) : (
        <Field label={side === 'buy' ? 'Spend' : 'Sell'} unit={side === 'buy' ? quote.symbol : base.symbol}>
          <Input value={amountIn} onChange={(e) => setAmountIn(e.target.value.trim())} inputMode="decimal" placeholder="0.00" className={INPUT} />
        </Field>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {[25, 50, 75, 100].map((p) => (
          <button
            key={p}
            onClick={() => setPct(p)}
            disabled={!w.trader}
            className="rounded-md border py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-40"
          >
            {p === 100 ? 'Max' : `${p}%`}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
        {kind === 'limit' ? (
          <>
            <Line k="Total" v={limitTotal ? `${fixed(limitTotal, Math.min(8, quote.decimals))} ${quote.symbol}` : '—'} />
            <Line k="Rests on" v="QRDX order book" />
          </>
        ) : (
          <>
            <Line
              k="Est. receive"
              v={q.data ? `${fmtSize(q.data.amountOut)} ${side === 'buy' ? base.symbol : quote.symbol}` : '—'}
            />
            <Line k="Avg. price" v={avgPrice ? `${fmtPrice(avgPrice, ref)} ${quote.symbol}` : '—'} />
            <Line k="Price impact" v={q.data?.priceImpact ? percent(String(Number(q.data.priceImpact) * 100), false) : q.data ? 'n/a (book)' : '—'} />
            <Line k="Route" v={q.data ? (q.data.venue === 'clob' ? 'Order book' : 'Pool') : '—'} />
            <Line k="Fee" v={q.data ? `${fmtSize(q.data.fee)} ${side === 'buy' ? quote.symbol : base.symbol}` : '—'} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Max slippage</span>
              <span className="flex items-center gap-1">
                <input
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  className="num w-12 rounded border bg-background px-1 py-0.5 text-right"
                />
                %
              </span>
            </div>
            {q.data && !S.isZero(q.data.unfilledIn) && (
              <p className="text-warn">Only {fmtSize(q.data.amountIn)} can fill now; the rest is not spent.</p>
            )}
          </>
        )}
      </div>

      {!w.trader ? (
        <ConnectButton className="h-11 w-full" />
      ) : (
        <Button
          onClick={submit}
          disabled={!!problem || busy || !w.rightNetwork}
          className={cn(
            'h-11 w-full text-sm font-semibold text-white transition-all',
            accent === 'bid' ? 'bg-bid hover:bg-bid/90 shadow-lg shadow-bid/20' : 'bg-ask hover:bg-ask/90 shadow-lg shadow-ask/20'
          )}
        >
          {busy ? 'Confirm in wallet…' : problem && problem !== 'Getting a quote…' ? problem : `${side === 'buy' ? 'Buy' : 'Sell'} ${base.symbol}`}
        </Button>
      )}
      {msg && (
        <p className={cn('rounded-md px-2.5 py-2 text-xs', msg.ok ? 'bg-bid/10 text-bid' : 'bg-ask/10 text-ask')}>{msg.text}</p>
      )}

      <div className="mt-auto space-y-3 pt-2">
        {w.trader && account && (
          <div className="rounded-lg border p-2.5 text-xs">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Your balances</div>
            {[base, quote].map((a) => {
              const b = account.balances.find((x) => x.asset.address === a.address)
              return (
                <div key={a.segment} className="flex justify-between py-0.5">
                  <span>{a.symbol}</span>
                  <span className="num">
                    {fmtSize(b?.balance ?? '0')}
                    {b && !S.isZero(b.inOrders) && <span className="text-muted-foreground"> · {fmtSize(b.inOrders)} in orders</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground">
          {kind === 'limit' ? 'Limit orders rest on the QRDX order book and lock their funds until filled or cancelled. ' : 'Market orders swap through the better of the order book and the pools. '}
          {GAS_NOTE}
        </p>
      </div>
    </div>
  )
}

const INPUT = 'num h-10 pr-16 text-right text-sm font-medium'

function decimalsFor(ref: number) {
  const a = Math.abs(ref)
  return a >= 1000 ? 2 : a >= 1 ? 4 : Math.min(12, -Math.floor(Math.log10(a || 1)) + 5)
}

function Field({ label, unit, extra, children }: { label: string; unit: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {extra}
      </span>
      <span className="relative block">
        {children}
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">{unit}</span>
      </span>
    </label>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="num text-right">{v}</span>
    </div>
  )
}
