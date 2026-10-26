'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { S, dec, div, isAmount, lessSlippage, mul, round, str } from '@/lib/decimal'
import { perpTriggerKind, spotLimitParams, spotTriggerParams, twapPlan } from '@/lib/orders'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { fixed, percent, price as fmtPrice, size as fmtSize } from '@/lib/format'
import { useApi, useDebounced } from '@/lib/hooks/useApi'
import type { AccountResponse, OrderBook, SpotMarket, SwapQuote } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

type Side = 'buy' | 'sell'
type Kind = 'limit' | 'market' | 'stop' | 'twap'
type Tif = 'gtc' | 'alo' | 'ioc' | 'fok'
const TIFS: { id: Tif; label: string; title: string }[] = [
  { id: 'gtc', label: 'GTC', title: 'Good till cancelled: what does not fill rests on the book' },
  { id: 'alo', label: 'Post only', title: 'Refused if it would take: it only ever adds liquidity' },
  { id: 'ioc', label: 'IOC', title: 'Immediate or cancel: fills what it can now, cancels the rest' },
  { id: 'fok', label: 'FOK', title: 'Fill or kill: fills whole, or nothing happens' },
]

/** Exchange gas a single spot operation burns, in QRDX (docs/PERPS_API.md §1). */
const GAS_NOTE = 'A gas fee of about 0.0001 QRDX is burned whether or not it fills.'

export function SpotOrderForm({
  market,
  book,
  account,
  pickedPrice,
  pickedTrigger,
}: {
  market: SpotMarket
  book: OrderBook | null
  account: AccountResponse | null
  pickedPrice: string | null
  /** A chart level to use as a Stop order's trigger. */
  pickedTrigger?: { price: string; at: number } | null
}) {
  const w = useWallet()
  const { apiBase } = useNet()
  const { trading } = useFeatures()
  const [side, setSide] = useState<Side>('buy')
  const [kindState, setKind] = useState<Kind>('limit')
  const kind: Kind = !trading && (kindState === 'stop' || kindState === 'twap') ? 'limit' : kindState
  const [minutes, setMinutes] = useState('30')
  const twapMinutes = Number(minutes)
  const plan = kind === 'twap' && twapMinutes >= 1 ? twapPlan(Math.round(twapMinutes * 60)) : null
  const [tif, setTif] = useState<Tif>('gtc')
  const [hidden, setHidden] = useState(false)
  const [display, setDisplay] = useState('')
  const [withTpSl, setWithTpSl] = useState(false)
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [trigger, setTrigger] = useState('')
  useEffect(() => {
    if (pickedTrigger) {
      setTrigger(pickedTrigger.price)
      setKind('stop')
    }
  }, [pickedTrigger])
  // A stop's limit (empty: a market order when it fires); apart from the limit price, which the book seeds.
  const [stopLimit, setStopLimit] = useState('')
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
        `&amount=${swapIn}&venue=auto${w.tradingAccount ? `&sender=${w.tradingAccount}` : ''}`
      : null
  const q = useApi<SwapQuote>(quotePath, 10_000)

  const limitTotal = useMemo(() => {
    const at = kind === 'stop' ? stopLimit || trigger : price
    if (!isAmount(at) || !isAmount(size)) return null
    return str(mul(dec(at), dec(size)))
  }, [price, size, kind, trigger, stopLimit])
  // Spot triggers judge the pair's last order-book trade.
  const last = market.last ?? book?.mid ?? null
  const stopKind = kind === 'stop' && last && isAmount(trigger) && dec(trigger) > 0n ? (perpTriggerKind(side, trigger, last) === 'sl' ? 'stop_loss' : 'take_profit') : null
  const resting = kind === 'limit' && (tif === 'gtc' || tif === 'alo')
  // An attached TP/SL protects what a node-side buy bought: a buy of the base on an uninverted pair.
  const canAttach = trading && kind === 'limit' && side === 'buy' && !market.inverted
  const attach = canAttach && withTpSl

  const problem = (() => {
    if (market.status !== 'live') return 'This pair has no on-chain market.'
    if (kind === 'stop') {
      if (!isAmount(trigger) || dec(trigger) <= 0n) return 'Enter the trigger price.'
      if (stopLimit && (!isAmount(stopLimit) || dec(stopLimit) <= 0n)) return 'Enter a limit price, or leave it empty for market.'
      if (last && dec(trigger) === dec(last)) return 'The price is at the trigger already: place an order instead.'
      if (!isAmount(size, base.decimals) || dec(size) <= 0n) return `Enter a size (up to ${base.decimals} decimals).`
      // Escrowed now: the base for a sell; for a buy, quote at its highest price (10 % over the trigger without a limit).
      const need = side === 'buy' ? str(mul(dec(limitTotal!), stopLimit ? dec('1') : dec('1.1'))) : size
      if (w.trader && account && dec(need) > dec(avail)) return `Not enough ${availSym}.`
      return null
    }
    if (kind === 'twap') {
      const decimals = side === 'buy' ? quote.decimals : base.decimals
      if (!isAmount(amountIn, decimals) || dec(amountIn) <= 0n) return `Enter an amount (up to ${decimals} decimals).`
      if (w.trader && account && dec(amountIn) > dec(avail)) return `Not enough ${availSym}.`
      if (!(twapMinutes >= 1 && twapMinutes <= 1440)) return 'A TWAP runs 1 minute to 24 hours.'
      return null
    }
    if (kind === 'limit') {
      if (resting && display && (!isAmount(display) || dec(display) <= 0n || dec(display) >= dec(size || '0'))) return 'An iceberg shows less than its size.'
      if (attach) {
        if (!tp && !sl) return 'Enter a take profit, a stop loss, or both.'
        if (tp && (!isAmount(tp) || dec(tp) <= dec(price || '0'))) return 'The take profit goes above the buy price.'
        if (sl && (!isAmount(sl) || dec(sl) >= dec(price || '0'))) return 'The stop loss goes below the buy price.'
      }
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
    if (kind === 'market' || kind === 'twap') return setAmountIn(round(str(part), side === 'buy' ? quote.decimals : base.decimals, 'down'))
    if (side === 'sell') return setSize(round(str(part), base.decimals, 'down'))
    const at = kind === 'stop' ? stopLimit || trigger : price
    // A buy stop without a limit escrows up to 10 % over its trigger.
    const per = kind === 'stop' && !stopLimit ? mul(dec(at || '0'), dec('1.1')) : dec(at || '0')
    if (isAmount(at) && per > 0n) setSize(round(str(div(part, per)), base.decimals, 'down'))
  }

  const submit = async () => {
    if (problem) return
    setBusy(true)
    setMsg(null)
    try {
      if (kind === 'twap') {
        const [tin, tout] = side === 'buy' ? [quote, base] : [base, quote]
        await w.sendExchange({
          op: 'TWAP_ORDER',
          params: { token_in: tin.address, token_out: tout.address, amount_in: amountIn, duration: Math.round(twapMinutes * 60), slices: plan!.slices },
          gasLimit: plan!.gas + 20_000,
          label: `TWAP: ${amountIn} ${tin.symbol} → ${tout.symbol} over ${twapMinutes} min`,
          market: market.id,
        })
      } else if (kind === 'stop') {
        await w.sendExchange({
          op: 'PLACE_ORDER',
          params: spotTriggerParams(market, side, stopKind!, trigger, size, stopLimit || undefined),
          label: `${stopKind === 'stop_loss' ? 'Stop' : 'Take profit'}: ${side} ${size} ${base.symbol} when ${base.symbol} trades at ${trigger} ${quote.symbol}${stopLimit ? `, limit ${stopLimit}` : ''}`,
          market: market.id,
        })
      } else if (kind === 'limit') {
        const node = spotLimitParams(market, side, price, size)
        const legs = attach ? (['tp', 'sl'] as const).filter((k) => (k === 'tp' ? tp : sl)) : []
        await w.sendExchange({
          op: 'PLACE_ORDER',
          params: {
            ...node,
            ...(trading && tif !== 'gtc' ? { tif } : {}),
            ...(resting && hidden ? { hidden: true } : {}),
            // display_size is in token0, which is this market's quote when it is inverted.
            ...(resting && display ? { display_size: market.inverted ? str(mul(dec(display), dec(price))) : display } : {}),
            ...Object.fromEntries(legs.map((k) => [k, { trigger_price: k === 'tp' ? tp : sl }])),
          },
          label:
            `${side === 'buy' ? 'Buy' : 'Sell'} ${size} ${base.symbol} @ ${price} ${quote.symbol}` +
            (legs.length ? ` · ${legs.map((k) => `${k.toUpperCase()} ${k === 'tp' ? tp : sl}`).join(' / ')}` : ''),
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
        {(trading ? (['limit', 'market', 'stop', 'twap'] as const) : (['limit', 'market'] as const)).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn('relative pb-2 font-medium transition-colors', kind === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {k === 'limit' ? 'Limit' : k === 'market' ? 'Market' : k === 'stop' ? 'Stop' : 'TWAP'}
            {kind === k && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Available</span>
        <span className="num font-medium">{w.trader ? `${fmtSize(avail)} ${availSym}` : '—'}</span>
      </div>

      {kind === 'stop' ? (
        <>
          <Field label="Trigger (last trade)" unit={quote.symbol}>
            <Input value={trigger} onChange={(e) => setTrigger(e.target.value.trim())} inputMode="decimal" placeholder={last ? fmtPrice(last, ref) : ''} className={INPUT} />
          </Field>
          <Field label="Limit price (empty: market)" unit={quote.symbol}>
            <Input value={stopLimit} onChange={(e) => setStopLimit(e.target.value.trim())} inputMode="decimal" placeholder="Market" className={INPUT} />
          </Field>
          <Field label="Size" unit={base.symbol}>
            <Input value={size} onChange={(e) => setSize(e.target.value.trim())} inputMode="decimal" placeholder="0.00" className={INPUT} />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            {stopKind
              ? `${stopKind === 'stop_loss' ? 'Stop' : 'Take profit'}: ${side === 'buy' ? 'buys' : 'sells'} when ${base.symbol} trades ${dec(trigger) > dec(last ?? '0') ? 'up' : 'down'} to ${fmtPrice(trigger, ref)}, ${stopLimit ? `as a limit at ${fmtPrice(stopLimit, ref)}` : 'as a market order at most 10 % through the trigger'}. Its funds are locked until then.`
              : 'Fires when the pair trades at the trigger. Its funds are locked until it fires or you cancel it.'}
          </p>
        </>
      ) : kind === 'limit' ? (
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
          {trading && (
            <div className="space-y-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1">
                {TIFS.map((t) => (
                  <button key={t.id} type="button" title={t.title} onClick={() => setTif(t.id)} className={cn('rounded border px-2 py-0.5', tif === t.id ? 'border-foreground/60 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {resting && (
                  <label className="flex items-center gap-2" title="Matches like any order but shows nothing in the book's depth (its terms are still public on chain)">
                    <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
                    Hidden
                  </label>
                )}
                {resting && (
                  <span className="flex items-center gap-1 text-muted-foreground" title="Iceberg: show this much at a time; the rest waits hidden behind it">
                    Show
                    <input value={display} onChange={(e) => setDisplay(e.target.value.trim())} inputMode="decimal" placeholder="all" className="num h-6 w-16 rounded border bg-background px-1.5 text-right text-foreground" />
                    {base.symbol}
                  </span>
                )}
                {canAttach && (
                  <label className="flex items-center gap-2" title="One sell trigger that holds exactly what this buy bought: the first of TP and SL to fire cancels the other">
                    <input type="checkbox" checked={withTpSl} onChange={(e) => setWithTpSl(e.target.checked)} />
                    TP / SL
                  </label>
                )}
              </div>
              {attach && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={tp} onChange={(e) => setTp(e.target.value.trim())} inputMode="decimal" placeholder="Take profit" className="num h-9 text-right text-xs" />
                  <Input value={sl} onChange={(e) => setSl(e.target.value.trim())} inputMode="decimal" placeholder="Stop loss" className="num h-9 text-right text-xs" />
                </div>
              )}
            </div>
          )}
        </>
      ) : kind === 'twap' ? (
        <>
          <Field label={side === 'buy' ? 'Spend' : 'Sell'} unit={side === 'buy' ? quote.symbol : base.symbol}>
            <Input value={amountIn} onChange={(e) => setAmountIn(e.target.value.trim())} inputMode="decimal" placeholder="0.00" className={INPUT} />
          </Field>
          <Field label="Over" unit="min">
            <Input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={INPUT} />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            {plan ? `${plan.slices} slices, one every ${Math.round((twapMinutes * 60) / plan.slices)} s, each through the best venue at most 3 % from its price. The amount is locked now; what is not spent comes back if you stop it.` : 'Swaps the amount in equal slices over the time.'}
          </p>
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
        {kind === 'twap' ? (
          <Line k="Slices" v={plan ? `${plan.slices} × ${amountIn && isAmount(amountIn) ? fmtSize(str(div(dec(amountIn), dec(String(plan.slices))))) : '—'} ${side === 'buy' ? quote.symbol : base.symbol}` : '—'} />
        ) : kind !== 'market' ? (
          <>
            <Line k="Total" v={limitTotal ? `${kind === 'stop' && !stopLimit ? '≈ ' : ''}${fixed(limitTotal, Math.min(8, quote.decimals))} ${quote.symbol}` : '—'} />
            <Line k={kind === 'stop' ? 'Waits for' : 'Rests on'} v={kind === 'stop' ? 'its trigger, funds locked' : hidden ? 'QRDX order book, hidden' : 'QRDX order book'} />
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
          {busy ? 'Confirm in wallet…' : problem && problem !== 'Getting a quote…' ? problem : kind === 'stop' ? `Place ${stopKind === 'stop_loss' ? 'stop' : 'take profit'}: ${side} ${base.symbol}` : `${kind === 'twap' ? 'TWAP ' : ''}${side === 'buy' ? 'Buy' : 'Sell'} ${base.symbol}`}
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
          {kind === 'limit'
            ? 'Limit orders rest on the QRDX order book and lock their funds until filled or cancelled. '
            : kind === 'stop'
              ? 'Stop orders lock their funds until they fire or are cancelled. '
              : kind === 'twap'
                ? 'A TWAP locks its amount and swaps it slice by slice. '
              : 'Market orders swap through the better of the order book and the pools. '}
          {account?.freeActions?.freeNow ? `No gas: trading goes in the free lane (${account.freeActions.remaining.toLocaleString('en-US')} free actions left).` : GAS_NOTE}
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
