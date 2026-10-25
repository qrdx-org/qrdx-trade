'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { dec, div, isAmount, mul, round, str } from '@/lib/decimal'
import { compact, fixed, price as fmtPrice } from '@/lib/format'
import { collateralShortfall, gridPrice, gridPriceError, gridSizeError, walletCollateral } from '@/lib/perps'
import { perpTriggerKind, protectiveLegError, triggerGas, twapPlan } from '@/lib/orders'
import { useFeatures } from '@/lib/hooks/useFeatures'
import type { AccountResponse, OrderBook, PerpMarket } from '@/lib/types'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

type Side = 'buy' | 'sell'
type Kind = 'limit' | 'market' | 'stop' | 'twap'
type Tif = 'gtc' | 'ioc' | 'fok' | 'alo'
const TIFS: { id: Tif; label: string; title: string }[] = [
  { id: 'gtc', label: 'GTC', title: 'Good till cancelled: what does not fill rests on the book' },
  { id: 'alo', label: 'Post only', title: 'Refused if it would take: it only ever adds liquidity (pays the maker rate)' },
  { id: 'ioc', label: 'IOC', title: 'Immediate or cancel: fills what it can now, cancels the rest' },
  { id: 'fok', label: 'FOK', title: 'Fill or kill: fills whole, or nothing happens' },
]

/** What perps collateral is called: the node reports a token address, "QRDX", or "". */
export function collateralLabel(account: AccountResponse | null): string {
  const t = account?.perp?.collateral_token ?? ''
  if (!t) return 'collateral'
  if (t.toUpperCase() === 'QRDX') return 'QRDX'
  return account?.balances.find((b) => b.asset.address === t.toLowerCase())?.asset.symbol ?? `${t.slice(0, 8)}…`
}

/**
 * Perps orders are limit orders (docs/PERPS_API.md §1). "Market" is IOC at the
 * far side of the book plus a slippage allowance, so it fills what it can at
 * the book's prices and cancels the rest.
 */
export function marketPrice(book: OrderBook | null, side: Side, slippagePct: number, szDecimals: number | null = null): string | null {
  const best = side === 'buy' ? book?.bestAsk : book?.bestBid
  if (!best) return null
  const bps = BigInt(Math.round(slippagePct * 100))
  const p = (dec(best) * (side === 'buy' ? 10_000n + bps : 10_000n - bps)) / 10_000n
  // Onto the market's price grid, never tighter than the allowance: up for a buy, down for a sell.
  return gridPrice(str(p), szDecimals, side === 'buy' ? 'up' : 'down')
}

export function PerpOrderForm({
  market,
  book,
  account,
  pickedPrice,
  pickedTrigger,
}: {
  market: PerpMarket
  book: OrderBook | null
  account: AccountResponse | null
  pickedPrice: string | null
  /** A chart level to use as a Stop order's trigger. */
  pickedTrigger?: { price: string; at: number } | null
}) {
  const w = useWallet()
  const { trading } = useFeatures()
  const perp = account?.perp ?? null
  const current = perp?.leverage[market.id]
  const [side, setSide] = useState<Side>('buy')
  const [kindState, setKind] = useState<Kind>('limit')
  // Stop and TWAP orders need a node with the trading features; fall back if it has none.
  const kind: Kind = !trading && (kindState === 'stop' || kindState === 'twap') ? 'limit' : kindState
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [reduceOnly, setReduceOnly] = useState(false)
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
  const [stopLimit, setStopLimit] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [slippage] = useState(1)
  const [lev, setLev] = useState('')
  const [mode, setMode] = useState<'cross' | 'isolated'>('cross')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const ref = Number(market.markPrice ?? market.oraclePrice ?? 1)
  const unit = collateralLabel(account)

  useEffect(() => {
    if (pickedPrice) {
      setPrice(pickedPrice)
      setKind('limit')
    }
  }, [pickedPrice])
  useEffect(() => {
    if (!price && market.markPrice) setPrice(gridPrice(market.markPrice, market.szDecimals))
  }, [market.markPrice, market.szDecimals, price])
  // What the node actually applies: an explicit setting, else what an open position runs at.
  const position = perp?.positions[market.id]
  const effective = current?.leverage ?? (position && Number(position.size) !== 0 ? position.leverage : null)
  useEffect(() => {
    if (current) {
      setLev(current.leverage)
      setMode(current.mode)
    } else if (!lev && effective) setLev(round(effective, 2))
  }, [current, effective, lev])

  const mark = market.markPrice ?? market.oraclePrice ?? null
  const execPrice =
    kind === 'market'
      ? marketPrice(book, side, slippage, market.szDecimals)
      : kind === 'twap'
        ? (marketPrice(book, side, slippage, market.szDecimals) ?? mark) // (for the margin estimate only)
      : kind === 'stop'
        ? stopLimit || trigger
        : price
  const stopKind = kind === 'stop' && mark && isAmount(trigger) && dec(trigger) > 0n ? perpTriggerKind(side, trigger, mark) : null
  const resting = kind === 'limit' && (tif === 'gtc' || tif === 'alo')
  const attach = trading && withTpSl && !reduceOnly && (kind === 'limit' || kind === 'market')
  const notional = execPrice && isAmount(execPrice) && isAmount(size) ? str(mul(dec(execPrice), dec(size))) : null
  const leverage = current?.leverage ?? (lev || effective || '')
  const margin = notional && isAmount(leverage) && dec(leverage) > 0n ? str(div(dec(notional), dec(leverage))) : null

  // Margin beyond the free collateral can be deposited from the wallet with the order.
  const inWallet = walletCollateral(account)
  const topUp = perp && !reduceOnly ? collateralShortfall(margin, perp.withdrawable) : null
  const canTopUp = !!topUp && inWallet !== null && dec(inWallet) >= dec(topUp)

  const twapMinutes = Number(minutes)
  const plan = kind === 'twap' && twapMinutes >= 1 ? twapPlan(Math.round(twapMinutes * 60)) : null

  const grid = (p: string) => gridPriceError(p, market.szDecimals, market.id)
  const problem = (() => {
    if (!isAmount(size) || dec(size) <= 0n) return 'Enter a size.'
    const lots = gridSizeError(size, market.szDecimals, market.id)
    if (lots) return lots
    if (kind === 'stop') {
      if (isAmount(trigger) && grid(trigger)) return grid(trigger)
      if (stopLimit && isAmount(stopLimit) && grid(stopLimit)) return grid(stopLimit)
      if (!isAmount(trigger) || dec(trigger) <= 0n) return 'Enter the trigger price.'
      if (stopLimit && (!isAmount(stopLimit) || dec(stopLimit) <= 0n)) return 'Enter a limit price, or leave it empty for market.'
      if (mark && dec(trigger) === dec(mark)) return 'The mark is at the trigger already: place an order instead.'
      return null
    }
    if (kind === 'twap') {
      if (!(twapMinutes >= 1 && twapMinutes <= 1440)) return 'A TWAP runs 1 minute to 24 hours.'
      if (topUp && !canTopUp) return `Not enough ${unit} in the perps account or the wallet.`
      return null
    }
    if (!execPrice) return kind === 'market' ? 'The book is empty on that side.' : 'Enter a price.'
    if (!isAmount(execPrice) || dec(execPrice) <= 0n) return 'Enter a price.'
    if (kind === 'limit' && grid(execPrice)) return grid(execPrice)
    if (resting && display) {
      const shown = gridSizeError(display, market.szDecimals, market.id)
      if (shown) return shown
      if (!isAmount(display) || dec(display) <= 0n) return 'Enter the size shown at a time.'
      if (dec(display) >= dec(size)) return 'An iceberg shows less than its size.'
    }
    if (attach && mark) {
      const long = side === 'buy'
      if (!tp && !sl) return 'Enter a take profit, a stop loss, or both.'
      if (tp) {
        const e = protectiveLegError(long, 'tp', tp, mark) ?? grid(tp)
        if (e) return e
      }
      if (sl) {
        const e = protectiveLegError(long, 'sl', sl, mark) ?? grid(sl)
        if (e) return e
      }
    }
    if (topUp && !canTopUp) return `Not enough ${unit} in the perps account or the wallet.`
    return null
  })()

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: ok })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }
  const submitted = 'Submitted. It executes when the next block includes it (~3 min).'

  /** The order to sign: a PERP_ORDER, a PERP_TRIGGER (stop) or a TWAP_ORDER. */
  const orderRequest = () => {
    const dir = side === 'buy' ? 'Long' : 'Short'
    if (kind === 'stop') {
      return {
        op: 'PERP_TRIGGER',
        params: {
          market_id: market.id,
          side,
          kind: stopKind!,
          trigger_price: trigger,
          size,
          ...(stopLimit ? { limit_price: stopLimit } : {}),
          ...(reduceOnly ? { reduce_only: true } : {}),
        },
        gasLimit: triggerGas() + 60_000,
        label: `${stopKind === 'sl' ? 'Stop' : 'Take profit'}: ${dir.toLowerCase()} ${size} ${market.base} when the mark reaches ${trigger}${stopLimit ? `, limit ${stopLimit}` : ''}`,
        market: market.id,
      }
    }
    if (kind === 'twap') {
      return {
        op: 'TWAP_ORDER',
        params: {
          market_id: market.id,
          side,
          size,
          duration: Math.round(twapMinutes * 60),
          slices: plan!.slices,
          ...(reduceOnly ? { reduce_only: true } : {}),
        },
        gasLimit: plan!.gas + 20_000,
        label: `TWAP: ${dir.toLowerCase()} ${size} ${market.base} over ${twapMinutes} min`,
        market: market.id,
      }
    }
    const legs = attach ? (['tp', 'sl'] as const).filter((k) => (k === 'tp' ? tp : sl)) : []
    return {
      op: 'PERP_ORDER',
      params: {
        market_id: market.id,
        side,
        size,
        price: execPrice!,
        ...(reduceOnly ? { reduce_only: true } : {}),
        ...(kind === 'market' ? { tif: 'ioc' } : trading && tif !== 'gtc' ? { tif } : {}),
        ...(resting && hidden ? { hidden: true } : {}),
        ...(resting && display ? { display_size: display } : {}),
        ...Object.fromEntries(legs.map((k) => [k, { trigger_price: k === 'tp' ? tp : sl }])),
      },
      // Each attached TP/SL prepays a trigger's matching; the order matches with what is left.
      ...(legs.length ? { gasLimit: 1_000_000 + legs.length * triggerGas() } : {}),
      label:
        `${dir} ${size} ${market.base} ${kind === 'market' ? 'market' : `@ ${execPrice}`}${reduceOnly ? ' (reduce-only)' : ''}` +
        (legs.length ? ` · ${legs.map((k) => `${k.toUpperCase()} ${k === 'tp' ? tp : sl}`).join(' / ')}` : ''),
      market: market.id,
    }
  }

  const placeOrder = () =>
    run(
      'order',
      async () => {
        const order = orderRequest()
        const deposit = topUp && kind !== 'stop' ? { op: 'PERP_DEPOSIT', params: { amount: topUp }, label: `Deposit ${topUp} ${unit} perps collateral` } : null
        if (deposit && trading) {
          // One approval, and on a node with BATCH one transaction: the deposit and the order land together or not at all.
          await w.sendExchangeBatch({ ops: [deposit, order], label: `${deposit.label}, then ${order.label}`, market: market.id })
        } else {
          // Two operations in one block window: the deposit's nonce comes first, so it settles first.
          if (deposit) await w.sendExchange(deposit)
          await w.sendExchange(order)
        }
        setSize('')
      },
      submitted
    )

  const setLeverage = () =>
    run(
      'lev',
      () =>
        w.sendExchange({
          op: 'PERP_SET_LEVERAGE',
          params: { market_id: market.id, leverage: lev, mode },
          label: `Set ${market.id} leverage ${lev}× ${mode}`,
          market: market.id,
        }),
      submitted
    )

  const levChanged = !current || current.leverage !== lev || current.mode !== mode

  return (
    <div className="flex flex-1 flex-col gap-3.5 p-3">
      <div className="flex items-center gap-2 text-xs">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'cross' | 'isolated')}
          className="h-8 rounded-md border bg-background px-2 font-medium"
        >
          <option value="cross">Cross</option>
          <option value="isolated">Isolated</option>
        </select>
        <input
          value={lev}
          onChange={(e) => setLev(e.target.value.trim())}
          placeholder="default"
          className="num h-8 w-16 rounded-md border bg-background px-2 text-right"
          aria-label="Leverage"
        />
        <span className="text-muted-foreground">× · max {market.maxLeverage ?? '—'}×</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 text-xs"
          disabled={!w.trader || !levChanged || busy !== null || !isAmount(lev)}
          onClick={setLeverage}
        >
          {busy === 'lev' ? '…' : 'Set'}
        </Button>
      </div>
      <p className="-mt-2 text-[10px] text-muted-foreground">
        {current
          ? `On chain: ${current.leverage}× ${current.mode}`
          : effective
            ? `Not set: the node's default applies (${round(effective, 2)}× now)`
            : "Not set: the node's default applies"}
      </p>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn('rounded-md py-1.5 font-semibold transition-all', side === s ? (s === 'buy' ? 'bg-bid text-white shadow-sm shadow-bid/30' : 'bg-ask text-white shadow-sm shadow-ask/30') : 'text-muted-foreground hover:text-foreground')}
          >
            {s === 'buy' ? 'Long' : 'Short'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4 border-b text-[13px]">
        {(trading ? (['limit', 'market', 'stop', 'twap'] as const) : (['limit', 'market'] as const)).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('relative pb-2 font-medium transition-colors', kind === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {k === 'limit' ? 'Limit' : k === 'market' ? 'Market' : k === 'stop' ? 'Stop' : 'TWAP'}
            {kind === k && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />}
          </button>
        ))}
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Free collateral</span>
          <span className="num font-medium">{perp ? `${fixed(perp.withdrawable, 2)} ${unit}` : '—'}</span>
        </div>
        {inWallet !== null && (
          <div className="flex justify-between" title="In your wallet, not yet deposited into the perps account">
            <span className="text-muted-foreground">In wallet</span>
            <span className="num">{compact(inWallet)} {unit}</span>
          </div>
        )}
      </div>

      {kind === 'limit' ? (
        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>Price</span>
            <span>{market.quote}</span>
          </span>
          <Input value={price} onChange={(e) => setPrice(e.target.value.trim())} inputMode="decimal" className="num h-10 text-right text-sm font-medium" />
        </label>
      ) : kind === 'stop' ? (
        <>
          <label className="block">
            <span className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Trigger (mark price)</span>
              <span>{market.quote}</span>
            </span>
            <Input value={trigger} onChange={(e) => setTrigger(e.target.value.trim())} inputMode="decimal" placeholder={mark ? fmtPrice(mark, ref) : ''} className="num h-10 text-right text-sm font-medium" />
          </label>
          <label className="block">
            <span className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Limit price</span>
              <span>empty: market</span>
            </span>
            <Input value={stopLimit} onChange={(e) => setStopLimit(e.target.value.trim())} inputMode="decimal" placeholder="Market" className="num h-10 text-right text-sm font-medium" />
          </label>
          <p className="text-[11px] text-muted-foreground">
            {stopKind
              ? `${stopKind === 'sl' ? 'Stop' : 'Take profit'}: ${side === 'buy' ? 'buys' : 'sells'} when the mark ${dec(trigger) > dec(mark ?? '0') ? 'rises' : 'falls'} to ${fmtPrice(trigger, ref)}, ${stopLimit ? `as a limit at ${fmtPrice(stopLimit, ref)}` : 'as a market order at most 10 % through the mark'}.`
              : 'Fires when the mark price reaches the trigger. Margin is checked when it fires, not now.'}
          </p>
        </>
      ) : kind === 'twap' ? (
        <>
          <label className="block">
            <span className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Duration</span>
              <span>minutes</span>
            </span>
            <Input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="num h-10 text-right text-sm font-medium" />
          </label>
          <p className="text-[11px] text-muted-foreground">
            {plan
              ? `${plan.slices} slices, one every ${fixed(String((twapMinutes * 60) / plan.slices), 0)} s, each at most 3 % from the mark; a slice that misses is made up later.`
              : 'Works the size into the market in equal slices.'}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Fills now against the book up to {execPrice ? fmtPrice(execPrice, ref) : '—'} ({slippage}% past the best {side === 'buy' ? 'ask' : 'bid'}); the rest is cancelled.
        </p>
      )}
      <label className="block">
        <span className="mb-1.5 flex justify-between text-xs text-muted-foreground">
          <span>Size</span>
          <span>{market.base}</span>
        </span>
        <Input value={size} onChange={(e) => setSize(e.target.value.trim())} inputMode="decimal" placeholder="0.00" className="num h-10 text-right text-sm font-medium" />
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce only
        </label>
        {trading && (kind === 'limit' || kind === 'market') && !reduceOnly && (
          <label className="flex items-center gap-2" title="Reduce-only stop-loss and take-profit orders sized to this one; the first to fire cancels the other">
            <input type="checkbox" checked={withTpSl} onChange={(e) => setWithTpSl(e.target.checked)} />
            TP / SL
          </label>
        )}
        {trading && resting && (
          <label className="flex items-center gap-2" title="Matches like any order but shows nothing in the book's depth (its terms are still public on chain)">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Hidden
          </label>
        )}
      </div>
      {trading && kind === 'limit' && (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {TIFS.map((t) => (
            <button key={t.id} type="button" title={t.title} onClick={() => setTif(t.id)} className={cn('rounded border px-2 py-0.5', tif === t.id ? 'border-foreground/60 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
          {resting && (
            <span className="ml-auto flex items-center gap-1 text-muted-foreground" title="Iceberg: show this much at a time; the rest waits hidden behind it">
              Show
              <input value={display} onChange={(e) => setDisplay(e.target.value.trim())} inputMode="decimal" placeholder="all" className="num h-6 w-16 rounded border bg-background px-1.5 text-right text-foreground" />
            </span>
          )}
        </div>
      )}
      {attach && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">Take profit</span>
            <Input value={tp} onChange={(e) => setTp(e.target.value.trim())} inputMode="decimal" placeholder={side === 'buy' ? 'above mark' : 'below mark'} className="num h-9 text-right text-xs" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted-foreground">Stop loss</span>
            <Input value={sl} onChange={(e) => setSl(e.target.value.trim())} inputMode="decimal" placeholder={side === 'buy' ? 'below mark' : 'above mark'} className="num h-9 text-right text-xs" />
          </label>
        </div>
      )}

      <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
        <Line k="Order value" v={notional ? `${fixed(notional, 2)} ${market.quote}` : '—'} />
        <Line k="Margin required" v={margin ? `${fixed(margin, 2)} ${unit}` : '—'} />
        <Line k="Mark / oracle" v={`${fmtPrice(market.markPrice, ref)} / ${fmtPrice(market.oraclePrice, ref)}`} />
        {account?.fees && (
          <Line
            k="Fees (taker / maker)"
            v={`${(Number(account.fees.taker) * 100).toFixed(3)} % / ${(Number(account.fees.maker) * 100).toFixed(3)} %`}
          />
        )}
      </div>

      {!w.trader ? (
        <ConnectButton className="h-11 w-full" />
      ) : (
        <Button
          onClick={placeOrder}
          disabled={!!problem || busy !== null || !w.rightNetwork}
          className={cn('h-11 w-full text-sm font-semibold text-white', side === 'buy' ? 'bg-bid shadow-lg shadow-bid/20 hover:bg-bid/90' : 'bg-ask shadow-lg shadow-ask/20 hover:bg-ask/90')}
        >
          {busy === 'order'
            ? 'Confirm in wallet…'
            : (problem ??
              (kind === 'stop'
                ? `Place ${stopKind === 'sl' ? 'stop' : 'take profit'}: ${side === 'buy' ? 'long' : 'short'} ${market.base}`
                : `${canTopUp ? `Deposit ${fixed(topUp!, 2)} ${unit} and ` : ''}${kind === 'twap' ? 'TWAP ' : ''}${side === 'buy' ? (canTopUp || kind === 'twap' ? 'long' : 'Long') : canTopUp || kind === 'twap' ? 'short' : 'Short'} ${market.base}`))}
        </Button>
      )}
      {msg && <p className={cn('rounded-md px-2.5 py-2 text-xs', msg.ok ? 'bg-bid/10 text-bid' : 'bg-ask/10 text-ask')}>{msg.text}</p>}

      {w.trader && <CollateralBox account={account} unit={unit} />}
    </div>
  )
}

function CollateralBox({ account, unit }: { account: AccountResponse | null; unit: string }) {
  const w = useWallet()
  const perp = account?.perp
  const inWallet = walletCollateral(account)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const go = async (op: 'PERP_DEPOSIT' | 'PERP_WITHDRAW') => {
    if (!isAmount(amount) || dec(amount) <= 0n) return setMsg('Enter an amount.')
    setBusy(true)
    setMsg(null)
    try {
      await w.sendExchange({ op, params: { amount }, label: `${op === 'PERP_DEPOSIT' ? 'Deposit' : 'Withdraw'} ${amount} ${unit} perps collateral` })
      setAmount('')
      setMsg('Submitted.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-auto space-y-2 rounded-lg border p-3 text-xs">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Perps account</div>
      <Line k="Equity" v={perp ? `${fixed(perp.equity, 2)} ${unit}` : '—'} />
      <Line k="Collateral" v={perp ? `${fixed(perp.collateral, 2)} ${unit}` : '—'} />
      <Line k="Maintenance margin" v={perp ? `${fixed(perp.maintenance_margin, 2)} ${unit}` : '—'} />
      <Line k="In open orders" v={perp ? `${fixed(perp.open_order_margin, 2)} ${unit}` : '—'} />
      {inWallet !== null && <Line k="In wallet, to deposit" v={`${fixed(inWallet, 2)} ${unit}`} />}
      <div className="flex gap-1 pt-1">
        <span className="relative flex-1">
          <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} placeholder={`Amount (${unit})`} className="h-8 pr-11 text-xs" />
          {inWallet !== null && dec(inWallet) > 0n && (
            <button
              type="button"
              onClick={() => setAmount(round(inWallet, 2, 'down'))}
              className="absolute inset-y-0 right-2 text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground"
            >
              Max
            </button>
          )}
        </span>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => go('PERP_DEPOSIT')}>
          Deposit
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => go('PERP_WITHDRAW')}>
          Withdraw
        </Button>
      </div>
      {msg && <p className="text-muted-foreground">{msg}</p>}
      {perp && !perp.collateral_token && <p className="text-warn">This node has no perps collateral token configured.</p>}
    </div>
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

