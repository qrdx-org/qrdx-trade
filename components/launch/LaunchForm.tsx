'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, Copy, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { dec, round, str } from '@/lib/decimal'
import { compact, fixed, price as fmtPrice } from '@/lib/format'
import { apiGet, useApi } from '@/lib/hooks/useApi'
import {
  FEE_TIERS,
  LaunchCurve,
  POOL_TYPES,
  PoolType,
  deriveTokenAddress,
  launchCurve,
  tickSpacing,
  validateLaunch,
} from '@/lib/launch'
import type { AccountResponse, ApiAsset, IndexPrice } from '@/lib/types'
import type { PoolRow } from '@/components/pools/PoolsList'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/**
 * Three ways in:
 *  - launch:  a new token and its market (token + pool in one block, then the curve)
 *  - token:   a new token only; its market can come later
 *  - market:  a market for a token that already exists (`/launch?token=0x…`): pool, then the curve
 */
type Kind = 'launch' | 'token' | 'market'
type Stage = 'waiting-token' | 'waiting-pool' | 'ready-curve' | 'waiting-curve' | 'done' | 'failed'

interface LaunchJob {
  kind: Kind
  stage: Stage
  name: string
  symbol: string
  tokenAddress: string
  deployTx?: string
  // market part (launch / market)
  quote?: { segment: string; address: string; symbol: string }
  curve?: LaunchCurve
  curveAmount?: string
  poolTx?: string
  poolId?: string
  curveTx?: string
  error?: string
  startedAt: number
}

interface Receipt {
  success: boolean
  error: string
  data: Record<string, unknown>
}

interface TokenInfo extends ApiAsset {
  token: { totalSupply: string; creator: string; mintAuthority: string | null; freezeAuthority: string | null } | null
}

const jobKey = (slot: string, trader: string) => `qrdx-trade:launch:${slot}:${trader.toLowerCase()}`

/** The receipt, or null while the transaction waits for a block. */
async function receipt(apiBase: string, txHash: string): Promise<Receipt | null> {
  try {
    return (await apiGet<Receipt>(`${apiBase}/receipts/${txHash}`)).data
  } catch {
    return null
  }
}

export function LaunchForm({ existingToken, onLaunched }: { existingToken?: string | null; onLaunched?: () => void }) {
  const w = useWallet()
  const router = useRouter()
  const { slot, apiBase, network } = useNet()
  const assets = useApi<{ assets: ApiAsset[] }>(`${apiBase}/assets`, 60_000)
  const prices = useApi<{ prices: Record<string, IndexPrice | null> }>(`${apiBase}/prices`, 60_000)
  const existing = useApi<TokenInfo>(existingToken ? `${apiBase}/assets/${existingToken}` : null)
  const holdings = useApi<AccountResponse>(
    existingToken && w.trader ? `${apiBase}/accounts/${w.trader}?tokens=${existingToken}` : null,
    10_000
  )

  const [choice, setChoice] = useState<'launch' | 'token'>('launch')
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [supply, setSupply] = useState('1000000000')
  const [quoteSeg, setQuoteSeg] = useState<string>('')
  const [startCap, setStartCap] = useState('')
  const [multiple, setMultiple] = useState(100)
  const [curvePercent, setCurvePercent] = useState(100)
  const [feeTier, setFeeTier] = useState<number>(10000)
  const [poolType, setPoolType] = useState<PoolType>('SUBSIDIZED')
  const [qrdxBalance, setQrdxBalance] = useState<string | null>(null)
  const [job, setJob] = useState<LaunchJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Quote assets: verified assets with a token on this network. QRDX (wQRDX) first, like pump.fun's SOL.
  const quotes = useMemo(
    () =>
      (assets.data?.assets ?? [])
        .filter((a) => a.listed && a.address && a.address !== existingToken)
        .sort((a, b) => Number(b.slug === 'qrdx') - Number(a.slug === 'qrdx')),
    [assets.data, existingToken]
  )
  const noQuotes = !!assets.data && quotes.length === 0
  const kind: Kind = existingToken ? 'market' : noQuotes ? 'token' : choice
  const withMarket = kind !== 'token'

  useEffect(() => {
    if (!quoteSeg && quotes[0]) setQuoteSeg(quotes[0].segment)
  }, [quotes, quoteSeg])
  const quote = quotes.find((q) => q.segment === quoteSeg) ?? null
  const quoteUsd = quote?.slug ? prices.data?.prices[quote.slug]?.price ?? null : null

  // The token: typed in (new) or read from the node (existing).
  const ex = existing.data
  const tokenName = kind === 'market' ? ex?.name ?? '' : name.trim()
  const tokenSymbol = kind === 'market' ? ex?.symbol ?? '' : symbol.trim()
  const totalSupply = kind === 'market' ? ex?.token?.totalSupply ?? '0' : supply
  const myBalance = existingToken
    ? holdings.data?.balances.find((b) => b.asset.address === existingToken)?.balance ?? '0'
    : null

  // Default starting market cap: about $5,000 when the quote has a USD price, else 5,000 units.
  useEffect(() => {
    if (!quote) return
    setStartCap(quoteUsd ? round(String(5000 / Number(quoteUsd)), 6) : '5000')
  }, [quote?.segment]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resume a launch in progress for this account and network.
  useEffect(() => {
    if (!w.trader) return setJob(null)
    try {
      const raw = localStorage.getItem(jobKey(slot, w.trader))
      setJob(raw ? (JSON.parse(raw) as LaunchJob) : null)
    } catch {
      setJob(null)
    }
  }, [w.trader, slot])
  const saveJob = useCallback(
    (j: LaunchJob | null) => {
      setJob(j)
      if (!w.trader) return
      try {
        if (j) localStorage.setItem(jobKey(slot, w.trader), JSON.stringify(j))
        else localStorage.removeItem(jobKey(slot, w.trader))
      } catch {
        /* progress then lives in memory only */
      }
    },
    [w.trader, slot]
  )

  // QRDX to pay for the pool: read from the wallet, which knows the PQ account's ledger id.
  useEffect(() => {
    const p = w.wallet?.provider
    if (!p || !w.account?.pqAccountId || !w.rightNetwork) return setQrdxBalance(null)
    p.request<string>({ method: 'eth_getBalance', params: [w.account.pqAccountId, 'latest'] })
      // Wei are 18-place QRDX, which is exactly how lib/decimal scales: str(wei) is the QRDX amount.
      .then((hex) => setQrdxBalance(str(BigInt(hex))))
      .catch(() => setQrdxBalance(null))
  }, [w.wallet, w.account, w.rightNetwork, job?.stage])
  const cost = POOL_TYPES.find((p) => p.type === poolType)!

  // Pools that already exist for the pair: CREATE_POOL refuses a second one per fee tier.
  const pairPools = useApi<{ pools: PoolRow[] }>(
    kind === 'market' && existingToken && quote ? `${apiBase}/pools?base=${existingToken}&quote=${quote.segment}` : null
  )
  const takenPool = (pairPools.data?.pools ?? []).find((p) => p.feeTier === feeTier)

  const startPrice = useMemo(() => {
    if (!/^\d+(\.\d+)?$/.test(startCap) || !/^\d+(\.\d+)?$/.test(totalSupply) || dec(totalSupply) <= 0n) return null
    return Number(startCap) / Number(totalSupply)
  }, [startCap, totalSupply])

  const curveAmount = useMemo(() => {
    const from = kind === 'market' ? myBalance ?? '0' : supply
    if (!/^\d+(\.\d+)?$/.test(from)) return '0'
    return round(str((dec(from) * BigInt(curvePercent)) / 100n), 18, 'down')
  }, [kind, myBalance, supply, curvePercent])

  const preview = useMemo(() => {
    if (!withMarket || !quote?.address || !startPrice) return null
    try {
      // For a new token the address is not known yet; which side of the pair it lands on can
      // move the curve by up to one tick, so the preview says "about".
      const token = existingToken ?? '0x' + '0'.repeat(40)
      return launchCurve({ token, quote: quote.address, startPrice, multiple, spacing: tickSpacing(feeTier) })
    } catch (e) {
      return (e as Error).message
    }
  }, [withMarket, existingToken, quote, startPrice, multiple, feeTier])

  const problem = (() => {
    if (kind === 'market') {
      if (existing.error) return existing.error.message
      if (!ex?.token) return 'Loading the token…'
      if (dec(curveAmount) <= 0n) return `You hold no ${tokenSymbol} to put on the curve.`
    } else {
      const v = validateLaunch({ name, symbol, supply, curvePercent: kind === 'token' ? 100 : curvePercent })
      if (v) return v
    }
    if (!withMarket) return null
    if (!quote) return 'Choose what the coin trades against.'
    if (takenPool) return `A ${tokenSymbol}/${quote.symbol} pool with this fee already exists.`
    if (!startPrice) return 'Enter a starting market cap.'
    if (typeof preview === 'string') return preview
    if (qrdxBalance !== null && dec(qrdxBalance) < dec(cost.qrdx) + dec('1')) return `You need ${cost.qrdx} QRDX plus gas to create the pool.`
    return null
  })()

  const createPool = async (tokenAddress: string, sym: string) => {
    const curve = launchCurve({ token: tokenAddress, quote: quote!.address!, startPrice: startPrice!, multiple, spacing: tickSpacing(feeTier) })
    const pool = await w.sendExchange({
      op: 'CREATE_POOL',
      params: {
        token0: curve.token0,
        token1: curve.token1,
        fee_tier: feeTier,
        pool_type: poolType,
        initial_price: curve.initialPrice,
        stake_amount: cost.qrdx,
      },
      label: `Create ${sym}/${quote!.symbol} pool`,
    })
    return { curve, poolTx: pool.txHash }
  }

  const fail = (j: LaunchJob, error: string) => saveJob({ ...j, stage: 'failed', error })

  // ── start ──
  const start = async () => {
    if (problem || !w.trader) return
    setBusy(true)
    setMsg(null)
    let pendingJob: LaunchJob | null = null
    try {
      const marketPart = withMarket
        ? { quote: { segment: quote!.segment, address: quote!.address!, symbol: quote!.symbol }, curveAmount }
        : {}
      if (kind === 'market') {
        const { curve, poolTx } = await createPool(existingToken!, tokenSymbol)
        saveJob({
          kind, stage: 'waiting-pool', name: tokenName, symbol: tokenSymbol, tokenAddress: existingToken!,
          ...marketPart, curve, poolTx, startedAt: Date.now() / 1000,
        })
        return
      }
      const sym = symbol.trim()
      const deploy = await w.sendExchange({
        op: 'TOKEN_DEPLOY',
        params: { name: name.trim(), symbol: sym, decimals: 18, initial_supply: supply },
        label: `Create ${sym} (${supply} supply)`,
      })
      if (deploy.nonce === undefined) throw new Error('This wallet version does not report the nonce it signed with. Update QRDX Wallet.')
      const tokenAddress = deriveTokenAddress(w.trader, deploy.nonce, sym)
      pendingJob = {
        kind, stage: kind === 'token' ? 'waiting-token' : 'waiting-pool', name: name.trim(), symbol: sym,
        tokenAddress, deployTx: deploy.txHash, ...marketPart, startedAt: Date.now() / 1000,
      }
      saveJob(pendingJob)
      if (kind === 'launch') {
        // Same block as the deploy: the wallet signed it with the next nonce, and the node
        // includes a sender's operations in nonce order.
        const { curve, poolTx } = await createPool(tokenAddress, sym)
        saveJob({ ...pendingJob, curve, poolTx })
      }
    } catch (e) {
      const message = (e as Error).message
      setMsg(message)
      if (pendingJob) {
        // The deploy went out: the token will exist, without a pool. Keep the record and say so.
        fail(pendingJob, `${message} ${pendingJob.symbol} is still being created at ${pendingJob.tokenAddress}, without a market. Start one once it exists.`)
      }
    } finally {
      setBusy(false)
    }
  }

  // ── watch receipts ──
  useEffect(() => {
    if (!job || !['waiting-token', 'waiting-pool', 'waiting-curve'].includes(job.stage)) return
    let stop = false
    const tick = async () => {
      if (job.deployTx && (job.stage === 'waiting-token' || job.stage === 'waiting-pool')) {
        const d = await receipt(apiBase, job.deployTx)
        if (stop || !d) return
        if (!d.success) return fail(job, `Token creation failed: ${d.error}`)
        if (String(d.data.token_address).toLowerCase() !== job.tokenAddress) {
          return fail(job, `The node created the token at ${String(d.data.token_address)}, not at ${job.tokenAddress}.`)
        }
        if (job.stage === 'waiting-token') {
          saveJob({ ...job, stage: 'done' })
          return onLaunched?.()
        }
      }
      if (job.stage === 'waiting-pool') {
        if (!job.poolTx) return
        const p = await receipt(apiBase, job.poolTx)
        if (stop || !p) return
        if (!p.success) return fail(job, `${job.kind === 'launch' ? 'The token exists, but creating' : 'Creating'} its pool failed: ${p.error}`)
        saveJob({ ...job, stage: 'ready-curve', poolId: String(p.data.pool_id) })
      } else if (job.stage === 'waiting-curve' && job.curveTx) {
        const c = await receipt(apiBase, job.curveTx)
        if (stop || !c) return
        if (!c.success) return fail(job, `Depositing the curve failed: ${c.error}`)
        saveJob({ ...job, stage: 'done' })
        onLaunched?.()
      }
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [job, apiBase, saveJob, onLaunched]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── the curve ──
  const depositCurve = async () => {
    if (!job?.poolId || !job.curve || !job.curveAmount || !job.quote) return
    setBusy(true)
    setMsg(null)
    try {
      const { data: q } = await apiGet<{ liquidity: string; amount0: string; amount1: string }>(
        `${apiBase}/quote/liquidity?pool=${job.poolId}&tickLower=${job.curve.tickLower}&tickUpper=${job.curve.tickUpper}` +
          `&${job.curve.depositSide}=${job.curveAmount}`
      )
      const other = job.curve.depositSide === 'amount0' ? q.amount1 : q.amount0
      if (dec(other) > 0n) throw new Error(`The pool's price moved into the curve; it now wants ${other} ${job.quote.symbol} too. Add liquidity from the pool page.`)
      const tx = await w.sendExchange({
        op: 'ADD_LIQUIDITY',
        params: { pool_id: job.poolId, tick_lower: job.curve.tickLower, tick_upper: job.curve.tickUpper, amount: q.liquidity },
        label: `Deposit ${job.symbol} launch curve`,
      })
      saveJob({ ...job, stage: 'waiting-curve', curveTx: tx.txHash })
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!w.trader) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">Connect the QRDX Wallet to create a coin.</p>
        <ConnectButton className="mt-3 w-full" />
      </Panel>
    )
  }

  if (job) {
    return (
      <LaunchProgress
        job={job}
        busy={busy}
        msg={msg}
        onDeposit={depositCurve}
        onReset={() => saveJob(null)}
        onStartMarket={() => {
          saveJob(null)
          router.push(`/launch?token=${job.tokenAddress}`)
        }}
      />
    )
  }

  const curvePreview = typeof preview === 'object' && preview ? preview : null
  return (
    <Panel>
      {kind === 'market' ? (
        <>
          <h2 className="text-base font-semibold">Start a market for {tokenSymbol || 'a token'}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A pool for an existing token and a launch curve holding your {tokenSymbol || 'tokens'}. On {network.name}.{' '}
            <Link href="/launch" className="underline">Create a new coin instead</Link>
          </p>
          {ex && (
            <div className="mt-3 rounded-md border p-2 text-xs">
              <div className="font-medium">
                {ex.name} <span className="text-muted-foreground">{ex.symbol}</span>
                {!ex.verified && <span className="ml-1 text-amber-500">unverified</span>}
              </div>
              <div className="break-all font-mono text-[11px] text-muted-foreground">{ex.address}</div>
              {ex.token && (
                <div className="mt-1 text-muted-foreground">
                  Supply {compact(ex.token.totalSupply)} · {ex.token.mintAuthority ? <span className="text-amber-500">mintable</span> : 'fixed'} ·{' '}
                  {ex.token.freezeAuthority ? <span className="text-amber-500">freezable</span> : 'not freezable'} · you hold {compact(myBalance ?? '0')}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="text-base font-semibold">Create a coin</h2>
          <div className="mt-3 grid grid-cols-2 rounded-md bg-muted p-0.5 text-xs">
            {(
              [
                ['launch', 'Coin + market'],
                ['token', 'Token only'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setChoice(k)}
                disabled={k === 'launch' && noQuotes}
                className={cn('rounded py-1.5', kind === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground', k === 'launch' && noQuotes && 'opacity-40')}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {kind === 'launch'
              ? `A token with a fixed supply, its pool, and a launch curve holding the supply, so it can be bought from the first block. On ${network.name}.`
              : `Just the token, with a fixed supply, all of it in your wallet. Start its market whenever you like, here or on Pools. On ${network.name}.`}
          </p>
          {noQuotes && (
            <p className="mt-2 text-xs text-amber-500">
              {network.name} has no verified asset to pair a market with yet (such as wrapped QRDX), so only the token can be
              created for now.
            </p>
          )}
        </>
      )}

      <div className="mt-4 space-y-3">
        {kind !== 'market' && (
          <>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Quantum Frog" />
            </Field>
            <Field label="Ticker">
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/\s/g, '').toUpperCase())} maxLength={16} placeholder="QFROG" />
            </Field>
            <Field label="Total supply" hint="Fixed forever: no one can mint more.">
              <Input value={supply} onChange={(e) => setSupply(e.target.value.trim())} inputMode="decimal" className="tabular" />
            </Field>
          </>
        )}

        {withMarket && (
          <>
            <Field label="Trades against">
              <div className="flex flex-wrap gap-1">
                {quotes.map((q) => (
                  <button key={q.segment} onClick={() => setQuoteSeg(q.segment)} className={cn('rounded border px-2 py-1 text-xs', quoteSeg === q.segment ? 'border-primary bg-accent' : 'text-muted-foreground')}>
                    {q.symbol}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`Starting market cap (${quote?.symbol ?? '…'})`} hint={quoteUsd && startCap ? `≈ $${compact(Number(startCap) * Number(quoteUsd))}` : undefined}>
              <Input value={startCap} onChange={(e) => setStartCap(e.target.value.trim())} inputMode="decimal" className="tabular" />
            </Field>
            <Field label="Curve ends at" hint="Market cap when the curve's last token is bought.">
              <div className="flex gap-1">
                {[10, 100, 1000].map((m) => (
                  <button key={m} onClick={() => setMultiple(m)} className={cn('flex-1 rounded border py-1 text-xs', multiple === m ? 'border-primary bg-accent' : 'text-muted-foreground')}>
                    {m}× start
                  </button>
                ))}
              </div>
            </Field>
            <Field
              label={`On the curve: ${curvePercent}% of ${kind === 'market' ? 'your balance' : 'the supply'}`}
              hint={`${compact(curveAmount)} ${tokenSymbol || 'tokens'} on the curve${curvePercent < 100 ? `; you keep ${100 - curvePercent}%. Buyers can see this.` : '.'}`}
            >
              <input type="range" min={kind === 'market' ? 10 : 50} max={100} step={5} value={curvePercent} onChange={(e) => setCurvePercent(Number(e.target.value))} className="w-full" />
            </Field>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Pool settings</summary>
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  {FEE_TIERS.map((f) => (
                    <button key={f.tier} onClick={() => setFeeTier(f.tier)} className={cn('flex-1 rounded border py-1', feeTier === f.tier ? 'border-primary bg-accent' : 'text-muted-foreground')}>
                      {f.rate} fee
                    </button>
                  ))}
                </div>
                <p className="text-muted-foreground">70 % of the fee goes to the pool&apos;s liquidity, which is your curve until others add theirs.</p>
              </div>
            </details>
            {takenPool && (
              <p className="text-xs text-amber-500">
                That pool exists already: <Link href={`/pools/${takenPool.poolId}`} className="underline">add liquidity on its page</Link>, or pick another fee.
              </p>
            )}
            <Field label="Pool cost">
              <div className="space-y-1">
                {POOL_TYPES.map((p) => (
                  <label key={p.type} className={cn('flex cursor-pointer gap-2 rounded border p-2 text-xs', poolType === p.type && 'border-primary bg-accent/50')}>
                    <input type="radio" checked={poolType === p.type} onChange={() => setPoolType(p.type)} />
                    <span>
                      <b>{p.label}</b>
                      <span className="block text-muted-foreground">{p.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>

      <div className="mt-4 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
        {withMarket && <Line k="Start price" v={curvePreview ? `about ${fmtPrice(String(curvePreview.startPrice))} ${quote?.symbol}` : '—'} />}
        {withMarket && <Line k="Curve ends at" v={curvePreview ? `about ${fmtPrice(String(curvePreview.endPrice))} ${quote?.symbol}` : '—'} />}
        <Line k="You pay" v={withMarket ? `${Number(cost.qrdx).toLocaleString()} QRDX + gas` : 'gas only (~0.0001 QRDX)'} />
        <Line k="Your QRDX" v={qrdxBalance === null ? '—' : fixed(qrdxBalance, 2)} />
        <Line k="Approvals" v={kind === 'launch' ? '2 now, 1 after the next block' : kind === 'market' ? '1 now, 1 after the next block' : '1'} />
      </div>

      <Button className="mt-4 w-full" disabled={!!problem || busy || !w.rightNetwork} onClick={start}>
        {busy
          ? 'Confirm in wallet…'
          : problem ?? (kind === 'launch' ? `Launch ${tokenSymbol || 'coin'}` : kind === 'token' ? `Create ${tokenSymbol || 'token'}` : `Start ${tokenSymbol} market`)}
      </Button>
      {msg && <p className="mt-2 text-xs text-ask">{msg}</p>}
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        {kind === 'market'
          ? 'The curve is ordinary pool liquidity in your name; you can withdraw it from the pool page, and buyers can see that you can.'
          : 'The token has no mint or freeze authority: its supply is fixed and no one can lock a holder’s coins.' +
            (kind === 'launch' ? ' The curve is ordinary pool liquidity in your name; you can withdraw it from the pool page, and buyers can see that you can.' : '')}
      </p>
    </Panel>
  )
}

function LaunchProgress({
  job,
  busy,
  msg,
  onDeposit,
  onReset,
  onStartMarket,
}: {
  job: LaunchJob
  busy: boolean
  msg: string | null
  onDeposit: () => void
  onReset: () => void
  onStartMarket: () => void
}) {
  const [copied, setCopied] = useState(false)
  const s = job.stage
  const failed = s === 'failed'
  const st = (done: boolean, active: boolean, failedHere: boolean) =>
    done ? 'done' : failedHere ? 'failed' : active ? 'active' : 'todo'
  const quote = job.quote?.symbol ?? ''
  const steps: { label: string; state: string }[] =
    job.kind === 'token'
      ? [{ label: `Create ${job.symbol}`, state: st(s === 'done', s === 'waiting-token', failed) }]
      : [
          {
            label: job.kind === 'launch' ? `Create ${job.symbol} and its ${quote} pool` : `Create the ${job.symbol}/${quote} pool`,
            state: st(!!job.poolId, s === 'waiting-pool', failed && !job.poolId),
          },
          { label: 'Deposit the launch curve', state: st(s === 'done', s === 'ready-curve' || s === 'waiting-curve', failed && !!job.poolId) },
          { label: 'Trading', state: st(s === 'done', false, false) },
        ]
  const path = job.quote ? `/trade/${job.tokenAddress}/${job.quote.segment}` : null
  const tokenOnlyDone = job.kind === 'token' && s === 'done'
  return (
    <Panel>
      <h2 className="text-base font-semibold">
        {job.kind === 'market' ? 'Starting a market for' : tokenOnlyDone ? 'Created' : 'Creating'} {job.name}{' '}
        <span className="text-muted-foreground">({job.symbol})</span>
      </h2>
      <button
        className="mt-1 flex items-center gap-1 break-all text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => {
          navigator.clipboard?.writeText(job.tokenAddress)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {job.tokenAddress} <Copy className="h-3 w-3 shrink-0" /> {copied && 'copied'}
      </button>
      <ol className="mt-4 space-y-3 text-sm">
        {steps.map((x) => (
          <li key={x.label} className="flex items-center gap-2">
            {x.state === 'done' ? (
              <CheckCircle2 className="h-4 w-4 text-bid" />
            ) : x.state === 'active' ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : x.state === 'failed' ? (
              <XCircle className="h-4 w-4 text-ask" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
            {x.label}
          </li>
        ))}
      </ol>
      {(s === 'waiting-pool' || s === 'waiting-token') && <p className="mt-3 text-xs text-muted-foreground">Waiting for the next block (about 3 minutes on QRDX).</p>}
      {s === 'ready-curve' && (
        <Button className="mt-4 w-full" disabled={busy} onClick={onDeposit}>
          {busy ? 'Confirm in wallet…' : `Deposit ${compact(job.curveAmount ?? '0')} ${job.symbol} on the curve`}
        </Button>
      )}
      {s === 'waiting-curve' && <p className="mt-3 text-xs text-muted-foreground">Depositing: waiting for the next block.</p>}
      {s === 'done' && path && (
        <Button className="mt-4 w-full" asChild>
          <Link href={path}>Trade {job.symbol}</Link>
        </Button>
      )}
      {tokenOnlyDone && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            {job.symbol} exists and the whole supply is in your wallet. It has no market yet: start one with a launch curve, or
            create a plain pool and add liquidity yourself.
          </p>
          <Button className="mt-3 w-full" onClick={onStartMarket}>
            Start its market (launch curve)
          </Button>
          <Button variant="outline" className="mt-2 w-full" asChild>
            <Link href={`/pools/new?token=${job.tokenAddress}`}>Create a plain pool</Link>
          </Button>
        </>
      )}
      {failed && <p className="mt-3 text-xs text-ask">{job.error}</p>}
      {failed && job.kind !== 'market' && job.deployTx && !job.poolId && (
        <Button variant="outline" className="mt-2 w-full" onClick={onStartMarket}>
          Start a market for {job.symbol} (once it exists)
        </Button>
      )}
      {msg && <p className="mt-2 text-xs text-ask">{msg}</p>}
      {(s === 'done' || failed) && (
        <Button variant="outline" className="mt-2 w-full" onClick={onReset}>
          Create another
        </Button>
      )}
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border bg-card p-4">{children}</section>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
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
