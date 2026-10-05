'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { dec, div, isAmount, mul, round, str } from '@/lib/decimal'
import { fixed, price as fmtPrice } from '@/lib/format'
import type { AccountResponse, OrderBook, PerpMarket } from '@/lib/types'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

type Side = 'buy' | 'sell'

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
export function marketPrice(book: OrderBook | null, side: Side, slippagePct: number): string | null {
  const best = side === 'buy' ? book?.bestAsk : book?.bestBid
  if (!best) return null
  const bps = BigInt(Math.round(slippagePct * 100))
  const p = (dec(best) * (side === 'buy' ? 10_000n + bps : 10_000n - bps)) / 10_000n
  return round(str(p), 2, side === 'buy' ? 'up' : 'down')
}

export function PerpOrderForm({
  market,
  book,
  account,
  pickedPrice,
}: {
  market: PerpMarket
  book: OrderBook | null
  account: AccountResponse | null
  pickedPrice: string | null
}) {
  const w = useWallet()
  const perp = account?.perp ?? null
  const current = perp?.leverage[market.id]
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<'limit' | 'market'>('limit')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [reduceOnly, setReduceOnly] = useState(false)
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
    if (!price && market.markPrice) setPrice(round(market.markPrice, 1))
  }, [market.markPrice, price])
  // What the node actually applies: an explicit setting, else what an open position runs at.
  const position = perp?.positions[market.id]
  const effective = current?.leverage ?? (position && Number(position.size) !== 0 ? position.leverage : null)
  useEffect(() => {
    if (current) {
      setLev(current.leverage)
      setMode(current.mode)
    } else if (!lev && effective) setLev(round(effective, 2))
  }, [current, effective, lev])

  const execPrice = kind === 'market' ? marketPrice(book, side, slippage) : price
  const notional = execPrice && isAmount(execPrice) && isAmount(size) ? str(mul(dec(execPrice), dec(size))) : null
  const leverage = current?.leverage ?? (lev || effective || '')
  const margin = notional && isAmount(leverage) && dec(leverage) > 0n ? str(div(dec(notional), dec(leverage))) : null

  const problem = (() => {
    if (!isAmount(size) || dec(size) <= 0n) return 'Enter a size.'
    if (!execPrice) return kind === 'market' ? 'The book is empty on that side.' : 'Enter a price.'
    if (!isAmount(execPrice) || dec(execPrice) <= 0n) return 'Enter a price.'
    if (perp && !reduceOnly && margin && dec(margin) > dec(perp.withdrawable)) return `Not enough free ${unit}.`
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

  const placeOrder = () =>
    run(
      'order',
      async () => {
        await w.sendExchange({
          op: 'PERP_ORDER',
          params: {
            market_id: market.id,
            side,
            size,
            price: execPrice!,
            ...(reduceOnly ? { reduce_only: true } : {}),
            ...(kind === 'market' ? { tif: 'ioc' } : {}),
          },
          label: `${side === 'buy' ? 'Long' : 'Short'} ${size} ${market.base} ${kind === 'market' ? 'market' : `@ ${execPrice}`}${reduceOnly ? ' (reduce-only)' : ''}`,
          market: market.id,
        })
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
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 text-xs">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'cross' | 'isolated')}
          className="h-7 rounded border bg-background px-1"
        >
          <option value="cross">Cross</option>
          <option value="isolated">Isolated</option>
        </select>
        <input
          value={lev}
          onChange={(e) => setLev(e.target.value.trim())}
          placeholder="default"
          className="h-7 w-16 rounded border bg-background px-1 text-right tabular"
          aria-label="Leverage"
        />
        <span>× (max {market.maxLeverage ?? '—'})</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 text-xs"
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

      <div className="grid grid-cols-2 rounded-md bg-muted p-0.5 text-sm">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn('rounded py-1.5 font-medium', side === s ? (s === 'buy' ? 'bg-bid text-white' : 'bg-ask text-white') : 'text-muted-foreground')}
          >
            {s === 'buy' ? 'Long' : 'Short'}
          </button>
        ))}
      </div>
      <div className="flex gap-3 text-sm">
        {(['limit', 'market'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('border-b-2 pb-0.5', kind === k ? 'border-primary' : 'border-transparent text-muted-foreground')}>
            {k === 'limit' ? 'Limit' : 'Market'}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Free collateral</span>
        <span className="tabular">{perp ? `${fixed(perp.withdrawable, 2)} ${unit}` : '—'}</span>
      </div>

      {kind === 'limit' ? (
        <label className="block">
          <span className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Price</span>
            <span>{market.quote}</span>
          </span>
          <Input value={price} onChange={(e) => setPrice(e.target.value.trim())} inputMode="decimal" className="h-9 text-right tabular" />
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">
          Fills now against the book up to {execPrice ? fmtPrice(execPrice, ref) : '—'} ({slippage}% past the best {side === 'buy' ? 'ask' : 'bid'}); the rest is cancelled.
        </p>
      )}
      <label className="block">
        <span className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Size</span>
          <span>{market.base}</span>
        </span>
        <Input value={size} onChange={(e) => setSize(e.target.value.trim())} inputMode="decimal" placeholder="0" className="h-9 text-right tabular" />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
        Reduce only
      </label>

      <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs">
        <Line k="Order value" v={notional ? `${fixed(notional, 2)} ${market.quote}` : '—'} />
        <Line k="Margin required" v={margin ? `${fixed(margin, 2)} ${unit}` : '—'} />
        <Line k="Mark / oracle" v={`${fmtPrice(market.markPrice, ref)} / ${fmtPrice(market.oraclePrice, ref)}`} />
      </div>

      {!w.trader ? (
        <ConnectButton className="w-full" />
      ) : (
        <Button
          onClick={placeOrder}
          disabled={!!problem || busy !== null || !w.rightNetwork}
          className={cn('w-full text-white', side === 'buy' ? 'bg-bid hover:bg-bid/90' : 'bg-ask hover:bg-ask/90')}
        >
          {busy === 'order' ? 'Confirm in wallet…' : problem ?? `${side === 'buy' ? 'Long' : 'Short'} ${market.base}`}
        </Button>
      )}
      {msg && <p className={cn('text-xs', msg.ok ? 'text-bid' : 'text-ask')}>{msg.text}</p>}

      {w.trader && <CollateralBox account={account} unit={unit} />}
    </div>
  )
}

function CollateralBox({ account, unit }: { account: AccountResponse | null; unit: string }) {
  const w = useWallet()
  const perp = account?.perp
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
    <div className="mt-2 space-y-2 border-t pt-3 text-xs">
      <div className="font-medium">Perps account</div>
      <Line k="Equity" v={perp ? `${fixed(perp.equity, 2)} ${unit}` : '—'} />
      <Line k="Collateral" v={perp ? `${fixed(perp.collateral, 2)} ${unit}` : '—'} />
      <Line k="Maintenance margin" v={perp ? `${fixed(perp.maintenance_margin, 2)} ${unit}` : '—'} />
      <Line k="In open orders" v={perp ? `${fixed(perp.open_order_margin, 2)} ${unit}` : '—'} />
      <div className="flex gap-1 pt-1">
        <Input value={amount} onChange={(e) => setAmount(e.target.value.trim())} placeholder={`Amount (${unit})`} className="h-8 text-xs" />
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => go('PERP_DEPOSIT')}>
          Deposit
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => go('PERP_WITHDRAW')}>
          Withdraw
        </Button>
      </div>
      {msg && <p className="text-muted-foreground">{msg}</p>}
      {perp && !perp.collateral_token && <p className="text-amber-500">This node has no perps collateral token configured.</p>}
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular">{v}</span>
    </div>
  )
}

