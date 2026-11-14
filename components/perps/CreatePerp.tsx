'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, Circle, Droplets, Gauge, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TokenPicker } from '@/components/swap/SwapCard'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { TradeGate } from '@/components/trade/TradeGate'
import { dec, isAmount, str } from '@/lib/decimal'
import { compact, fixed, price as fmtPrice } from '@/lib/format'
import { apiGet, useApi } from '@/lib/hooks/useApi'
import { walletCollateral } from '@/lib/perps'
import { explainNodeError } from '@/lib/reserve'
import type { AccountResponse, ApiAsset, PerpMarket } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { useFeatures } from '@/lib/hooks/useFeatures'
import { cn } from '@/lib/utils'

interface Check {
  token: string
  asset: ApiAsset | null
  quote: string
  marketId: string
  exists: boolean
  path: string
  nodeOk: boolean
  collateral: string | null
  collateralAsset: ApiAsset | null
  isCollateral: boolean
  spot: { route: 'direct' | 'qrdx' | null; pools: { id: string; token0: string; token1: string; feeRate: string }[] }
}

interface AssetList {
  assets: ApiAsset[]
  tokens?: ApiAsset[]
}

type Stage = 'signing' | 'block' | 'created' | 'priced' | 'failed'

const duration = (seconds: number) => (seconds >= 86_400 ? `${Math.round(seconds / 86_400)} days` : seconds >= 3_600 ? `${Math.round(seconds / 3_600)} hours` : `${Math.round(seconds / 60)} minutes`)

/**
 * List a token perp (CREATE_MARKET {token, liquidity}; qrdx-node docs/HYPERLIQUID_PARITY.md 13):
 * a perpetual on a token that trades on this chain, named by the token's address and priced
 * from the token's own pools. Anyone may list one per token. Perps on off-chain assets (BTC,
 * ETH, …) are priced by the validators and listed by governance, not here.
 */
export function CreatePerp() {
  const { slot, setSlot, apiBase, network } = useNet()
  const w = useWallet()
  const features = useFeatures()
  const costs = features.costs
  const maxLev = costs.perpSpotMaxLeverage ?? 10
  const minSeed = costs.perpMinLiquidity && Number(costs.perpMinLiquidity) > 0 ? costs.perpMinLiquidity : null
  const perps = useApi<{ perps: PerpMarket[] }>(`${apiBase}/perps`, 10_000)
  const list = useApi<AssetList>(`${apiBase}/assets?all=1`, 60_000)
  const account = useApi<AccountResponse>(w.trader ? `${apiBase}/accounts/${w.trader}` : null, 10_000)
  const [token, setToken] = useState<ApiAsset | null>(null)
  const [picking, setPicking] = useState(false)
  const [lev, setLev] = useState(maxLev)
  const [seedInput, setSeedInput] = useState('')
  const [stage, setStage] = useState<Stage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ marketId: string; symbol: string; path: string; tx: string } | null>(null)

  useEffect(() => setLev((l) => Math.min(l, maxLev)), [maxLev])

  const check = useApi<Check>(token?.address ? `${apiBase}/perps/check?token=${token.address}` : null, 15_000)
  const c = check.data && token?.address && check.data.token.toLowerCase() === token.address.toLowerCase() ? check.data : null
  const unit = c?.collateralAsset?.symbol ?? (c?.collateral ? `${c.collateral.slice(0, 8)}…` : 'collateral')

  const taken = useMemo(() => new Set((perps.data?.perps ?? []).map((m) => m.token?.toLowerCase()).filter(Boolean)), [perps.data])
  const tokens = useMemo(() => [...(list.data?.assets ?? []), ...(list.data?.tokens ?? [])].filter((a) => a.listed && a.address), [list.data])

  const seed = seedInput || minSeed || ''
  const free = account.data?.perp?.withdrawable ?? null
  const inWallet = walletCollateral(account.data ?? null, costs.feeReserveQrdx)
  const shortBy = seed && isAmount(seed) && free !== null && dec(seed) > dec(free) ? str(dec(seed) - dec(free)) : null
  const canDeposit = !!shortBy && inWallet !== null && dec(inWallet) >= dec(shortBy)

  const problem = !token
    ? 'Choose a token'
    : check.error && !c
      ? 'The token could not be checked'
      : !c
        ? 'Checking…'
        : !c.nodeOk
          ? 'The QRDX node is unreachable'
          : c.exists
            ? `${token.symbol} has its perp already`
            : c.isCollateral
              ? `Perps settle in ${token.symbol}`
              : !c.spot.route
                ? `${token.symbol} has no pool to price it`
                : !seed || !isAmount(seed)
                  ? 'Enter the liquidity'
                  : minSeed && dec(seed) < dec(minSeed)
                    ? `At least ${compact(minSeed)} ${unit} of liquidity`
                    : shortBy && !canDeposit
                      ? `Not enough ${unit}`
                      : null

  const create = async () => {
    if (problem || !c || !token) return
    setError(null)
    setStage('signing')
    try {
      const listing = {
        op: 'CREATE_MARKET',
        params: { token: c.token, liquidity: seed, max_leverage: String(lev) },
        label: `List the ${token.symbol} perpetual (up to ${lev}×), seeding its book with ${seed} ${unit}`,
        market: c.marketId,
      }
      const deposit = shortBy ? { op: 'PERP_DEPOSIT', params: { amount: shortBy }, label: `Deposit ${shortBy} ${unit} perps collateral` } : null
      // The seed comes from perps collateral: what is missing is deposited first, in the same transaction.
      const txHash = deposit
        ? (await w.sendExchangeBatch({ ops: [deposit, listing], label: `${deposit.label}, then ${listing.label[0].toLowerCase()}${listing.label.slice(1)}`, market: c.marketId })).txHashes.at(-1)!
        : (await w.sendExchange(listing)).txHash
      setCreated({ marketId: c.marketId, symbol: token.symbol, path: c.path, tx: txHash })
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
            setError(r.data.error ? explainNodeError(r.data.error) : 'The node refused the market.')
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
    }, 1_000)
    return () => {
      clearInterval(t)
      ctrl.abort()
    }
  }, [created, stage, apiBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const twap = costs.spotOracleTwapSeconds
  const minDepth = costs.spotOracleMinDepth

  return (
    <main>
      <section className="hero-glow border-b">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" /> Perpetuals · {slot === 'test' ? network.name : 'Testnet only'}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">List a token perpetual</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Open leveraged longs and shorts on any token that trades on QRDX. The market is named by the token&apos;s address and priced from
            the token&apos;s own pools: no vote and no key sets its price. Perpetuals on off-chain assets such as BTC are listed by governance.
          </p>
        </div>
      </section>

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {slot !== 'test' ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-background">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Listing markets is open on testnet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Try a new perpetual on test tokens first. Switch the site to testnet; with a wallet connected, the wallet asks to switch too.
            </p>
            <Button className="mt-5" onClick={() => void setSlot('test')}>
              Switch to testnet
            </Button>
          </div>
        ) : features.known && !features.trading ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">This network&apos;s node does not list token perpetuals yet.</div>
        ) : created && stage ? (
          <Progress created={created} stage={stage} error={error} lev={lev} onReset={() => (setCreated(null), setStage(null), setToken(null))} />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <TradeGate action="list a market">
              <div className="space-y-6 p-5">
                <Step n={1} title="Token" hint="Chosen by address. A symbol proves nothing: anyone can launch a token with any symbol.">
                  <button
                    onClick={() => setPicking(true)}
                    className="flex h-14 w-full items-center gap-3 rounded-lg border bg-background px-4 text-left transition-colors hover:border-foreground/30"
                  >
                    {token ? (
                      <>
                        <TokenBadge asset={token} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{token.symbol}</span>
                          <span className={cn('num block truncate text-[11px]', token.verified ? 'text-muted-foreground' : 'text-warn')}>
                            {token.verified ? token.name : 'Unverified'} · {token.address}
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="flex-1 text-sm text-muted-foreground">Select a token</span>
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  {token && <SpotStatus check={c} loading={!c && !check.error} symbol={token.symbol} unit={unit} twap={twap} minDepth={minDepth} />}
                </Step>

                <Step n={2} title="Maximum leverage" hint={`Token perpetuals take up to ${maxLev}× and isolated margin only. Initial margin is 1 ÷ leverage, maintenance half of that.`}>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={1}
                      max={maxLev}
                      value={lev}
                      onChange={(e) => setLev(Number(e.target.value))}
                      aria-label="Maximum leverage"
                      className="w-full accent-[hsl(var(--primary))]"
                    />
                    <span className="num w-14 text-right text-2xl font-semibold">{lev}×</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Metric k="Initial margin" v={`${trim(100 / lev)}%`} />
                    <Metric k="Maintenance" v={`${trim(50 / lev)}%`} />
                    <Metric k="Liquidated at" v={`−${trim(100 / lev - 50 / lev)}%`} hint="Adverse move from entry, at full leverage" />
                  </div>
                </Step>

                <Step
                  n={3}
                  title="Seed liquidity"
                  hint={`Your perps collateral that opens the market's liquidity vault, which quotes both sides of its book.${costs.perpLiquidityLockupSeconds ? ` Your share stays locked for ${duration(costs.perpLiquidityLockupSeconds)}.` : ''}`}
                >
                  <div className="relative">
                    <input
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder={minSeed ?? '0'}
                      inputMode="decimal"
                      aria-label="Seed liquidity"
                      className="num h-12 w-full rounded-lg border bg-background px-4 pr-24 text-lg font-semibold outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/30"
                    />
                    <span className="absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">{unit}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{minSeed ? `Minimum ${compact(minSeed)} ${unit}` : 'No minimum'}</span>
                    {free !== null && (
                      <span className="num">
                        Perps account {fixed(free, 2)} · wallet {inWallet !== null ? fixed(inWallet, 2) : '—'} {unit}
                      </span>
                    )}
                  </div>
                  {shortBy && (
                    <p className={cn('mt-2 rounded-md px-3 py-2 text-xs', canDeposit ? 'bg-muted text-muted-foreground' : 'bg-ask/10 text-ask')}>
                      {canDeposit
                        ? `${fixed(shortBy, 2)} ${unit} is deposited from your wallet into the perps account first, in the same transaction.`
                        : `You are ${fixed(shortBy, 2)} ${unit} short of this seed, in the perps account and the wallet together.`}
                    </p>
                  )}
                </Step>

                <Step n={4} title="Review">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                    <Row k="Market">{token ? `${token.symbol}-${c?.quote ?? 'USD'} perpetual` : '—'}</Row>
                    <Row k="Priced from">{c?.spot.route === 'qrdx' ? `${token?.symbol} pools, through QRDX` : `${token?.symbol ?? 'The token'}'s pools against ${unit}`}</Row>
                    <Row k="Margin">Isolated only, settled in {unit}</Row>
                    {costs.spotOiDepthMultiple != null && <Row k="Open interest cap">{trim(costs.spotOiDepthMultiple)}× the pools&apos; depth</Row>}
                    <Row k="Cost to list">
                      {costs.perpListingFee && Number(costs.perpListingFee) > 0 ? `${costs.perpListingFee} QRDX listing fee (burned)` : 'Gas only'}
                      {seed && isAmount(seed) ? `, plus the ${compact(seed)} ${unit} seed (yours, in the vault)` : ''}
                    </Row>
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
                      List the {token!.symbol} perpetual <ArrowRight className="ml-2 h-4 w-4" />
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
                <Link key={m.id} href={m.path} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <span className="flex min-w-0 items-center gap-2">
                    <TokenBadge asset={m.baseAsset ?? { symbol: m.symbol, color: '#64748b', verified: true }} size="sm" />
                    <span className="truncate font-medium">
                      {m.symbol}-{m.quote}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">
                    {m.markPrice ? fmtPrice(m.markPrice) : 'unpriced'} · OI {compact(m.openInterest)}
                  </span>
                </Link>
              ))}
              {perps.data && !perps.data.perps.length && <p className="px-2 py-3 text-xs text-muted-foreground">None yet. Yours would be the first.</p>}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold">How a token perpetual works</h3>
            <ol className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">
              <li>
                <b className="text-foreground">1. Priced from the token&apos;s pools.</b> Each block the market reads the deepest path of pools from the
                token to the settlement asset{twap ? ` and takes its ${duration(twap)} average price` : ''}. Nobody chooses the pools, not even the lister.
              </li>
              <li>
                <b className="text-foreground">2. Contained.</b> Positions use isolated margin, and open interest is capped by the pools&apos; depth, so a
                move in one token reaches only that market.
              </li>
              <li>
                <b className="text-foreground">3. Pauses without depth.</b> If the pools thin out
                {minDepth ? ` below ${compact(minDepth)} of the settlement asset` : ''}, the price stops updating and the market takes only orders
                that reduce positions.
              </li>
            </ol>
          </div>
        </aside>
      </div>

      <TokenPicker
        open={picking}
        assets={tokens.filter((a) => !taken.has(a.address!.toLowerCase()))}
        onClose={() => setPicking(false)}
        onPick={(a) => {
          setToken(a)
          setPicking(false)
        }}
      />
    </main>
  )
}

function SpotStatus({ check, loading, symbol, unit, twap, minDepth }: { check: Check | null; loading: boolean; symbol: string; unit: string; twap: number | null; minDepth: string | null }) {
  if (loading || !check)
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the token&apos;s pools…
      </p>
    )
  const warn = (body: React.ReactNode, action?: React.ReactNode) => (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs">
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
        <span>{body}</span>
      </span>
      {action}
    </div>
  )
  if (check.exists)
    return warn(
      `${symbol} already has its perpetual. Each token has one.`,
      <Link href={check.path} className="shrink-0 font-medium hover:underline">
        Trade it →
      </Link>
    )
  if (check.isCollateral) return warn(`Perpetuals settle in ${symbol}, so it has no price in itself and cannot have a perpetual here.`)
  if (!check.spot.route)
    return warn(
      `${symbol} has no pool with liquidity against ${unit}, directly or through QRDX. A token perpetual needs one to read its price from.`,
      <Link href="/pools/new" className="shrink-0 font-medium hover:underline">
        Create a pool →
      </Link>
    )
  return (
    <div className="mt-3 rounded-lg border border-bid/30 bg-bid/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-medium text-bid">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {check.spot.pools.length} pool{check.spot.pools.length === 1 ? '' : 's'} can price {symbol}
        {check.spot.route === 'qrdx' ? ', through QRDX' : ''}
      </div>
      <div className="mt-0.5 flex items-start gap-1.5 pl-[22px] text-muted-foreground">
        <Droplets className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          The node accepts the listing once the path has {twap ? duration(twap) : 'enough'} of price history
          {minDepth ? ` and ${compact(minDepth)} ${unit} of depth near the price` : ''}. It checks that when you sign.
        </span>
      </div>
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
  created: { marketId: string; symbol: string; path: string; tx: string }
  stage: Stage
  error: string | null
  lev: number
  onReset: () => void
}) {
  const order: Stage[] = ['signing', 'block', 'created', 'priced']
  const at = stage === 'failed' ? -1 : order.indexOf(stage)
  const steps = [
    { label: 'Signed and submitted', detail: <ExplorerLink kind="tx" id={created.tx} label={`Transaction ${created.tx.slice(0, 12)}…`} /> },
    { label: 'Included in a block', detail: 'Usually within a second.' },
    { label: 'Market listed', detail: `${created.symbol} perpetual, up to ${lev}× leverage` },
    { label: 'First oracle price', detail: "Read from the token's pools in the next block; then it trades." },
  ]
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{stage === 'failed' ? 'The market was not listed' : stage === 'priced' ? `The ${created.symbol} perpetual is live` : `Listing the ${created.symbol} perpetual`}</h2>
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
              Open the market <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
        <Button variant="outline" onClick={onReset}>
          List another
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
