'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Coins, Hourglass, Landmark, Loader2, PiggyBank, ShieldCheck, Undo2, Users, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { TradeGate } from '@/components/trade/TradeGate'
import { cmp, dec, div, mul, round, str } from '@/lib/decimal'
import { compact } from '@/lib/format'
import { apiGet, useApi } from '@/lib/hooks/useApi'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

// ─── API shapes (app/api/[version]/staking) ──────────────────────────────────────

interface Pool {
  validator: string
  commission_bps: number
  next_commission_bps: number | null
  value: string
  total_shares: string
  share_price: string
  delegators: number
  warming_up: string
}

interface Validator {
  address: string
  status: string
  stake: string
  effective_stake: string
  delegated: string
  weight: string
  earned: string
  activation_epoch: number | null
  exit_epoch: number | null
  slashed: boolean
  pool: Pool | null
  commissionBps: number
}

interface Staking {
  validators: Validator[]
  params: {
    reward_rate_bps_per_year: number
    default_commission_bps: number
    min_delegation: string
    min_validator_stake: string
    warmup_epochs: number
    unbonding_epochs: number
    withdrawal_delay_epochs: number
  }
  clock: { slotMs: number; slotsPerEpoch: number; epochMs: number } | null
  height: number | null
  epoch: number | null
}

interface Mine {
  stakes: { validator: string; shares: string; value: string; warming_up: { amount: string; active_from_epoch: number }[] }[]
  payouts: { id: number; kind: string; amount: string; due_epoch: number; validator: string }[]
  /** Spendable QRDX of the post-quantum account (what a delegation spends). */
  balance: string | null
}

type Stage = { kind: 'signing' | 'block' | 'done' | 'failed' | 'unconfirmed'; label: string; tx?: string; error?: string; since?: number }

/**
 * A block comes every 250 ms, so a receipt normally exists within a couple of seconds. The
 * node writes none for an operation it refused before running it (no QRDX for gas, say).
 */
const RECEIPT_WAIT_MS = 30_000
/** Kept back on "Max" so the delegation can still pay its gas (gas limit × price is well under this). */
const GAS_RESERVE = '0.01'
const AMOUNT_RE = /^\d+(\.\d{1,18})?$/

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`
const qrdx = (v: string | null | undefined, places = 4) => (v == null ? '—' : Number(round(v, places, 'down')).toLocaleString('en-US', { maximumFractionDigits: places }))

/** A span of epochs as time, at the network's epoch length. */
function epochsAsTime(epochs: number, epochMs: number | undefined): string {
  if (!epochMs) return `${epochs.toLocaleString()} epochs`
  const s = Math.max(0, Math.round((epochs * epochMs) / 1000))
  if (s < 90) return `${s} s`
  if (s < 5400) return `${Math.round(s / 60)} min`
  if (s < 172_800) return `${(s / 3600).toFixed(1)} h`
  return `${(s / 86_400).toFixed(1)} days`
}

/** What a delegator earns a year: the staking rate on the pool, less the validator's commission. */
const delegatorBps = (rateBps: number, commissionBps: number) => (rateBps * (10_000 - commissionBps)) / 10_000

export function StakeView() {
  const { apiBase, network, slot } = useNet()
  const w = useWallet()
  const staking = useApi<Staking>(`${apiBase}/staking`, 10_000)
  const mine = useApi<Mine>(w.trader ? `${apiBase}/staking/${w.trader}` : null, 8_000)
  const [selected, setSelected] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<Stage | null>(null)

  const s = staking.data
  const validators = useMemo(() => [...(s?.validators ?? [])].sort((a, b) => Number(b.weight) - Number(a.weight)), [s])
  const eligible = validators.filter((v) => v.status === 'active' && !v.slashed)
  const chosen = validators.find((v) => v.address === selected) ?? eligible[0] ?? null
  useEffect(() => {
    if (!selected && eligible[0]) setSelected(eligible[0].address)
  }, [selected, eligible])

  const rate = s?.params.reward_rate_bps_per_year ?? 0
  const epochMs = s?.clock?.epochMs
  const totalDelegated = validators.reduce((sum, v) => sum + Number(v.delegated), 0)
  const totalWeight = validators.filter((v) => v.status === 'active').reduce((sum, v) => sum + Number(v.weight), 0)
  const unbondEpochs = s ? s.params.unbonding_epochs + s.params.withdrawal_delay_epochs : 0

  // ── Delegate form ──
  const balance = mine.data?.balance ?? null
  const min = s?.params.min_delegation ?? '1'
  const problem = !chosen
    ? 'No active validator to delegate to'
    : !amount
      ? 'Enter an amount'
      : !AMOUNT_RE.test(amount)
        ? 'A number, at most 18 decimals'
        : cmp(dec(amount), dec(min)) < 0
          ? `At least ${min} QRDX`
          : balance != null && cmp(dec(amount), dec(balance)) > 0
            ? 'More than your balance'
            : null
  const yearly = !problem && chosen ? str(div(mul(dec(amount), dec(delegatorBps(rate, chosen.commissionBps))), dec(10_000))) : null
  const max = balance != null ? str(dec(balance) > dec(GAS_RESERVE) ? dec(balance) - dec(GAS_RESERVE) : 0n) : null

  const submit = async (op: 'STAKE_DELEGATE' | 'STAKE_UNDELEGATE', params: Record<string, string>, label: string) => {
    setStage({ kind: 'signing', label })
    try {
      const { txHash } = await w.sendExchange({ op, params, label })
      setStage({ kind: 'block', label, tx: txHash, since: Date.now() })
    } catch (e) {
      setStage({ kind: 'failed', label, error: (e as Error).message })
    }
  }

  // After signing: wait for the receipt.
  useEffect(() => {
    if (stage?.kind !== 'block' || !stage.tx) return
    const ctrl = new AbortController()
    const t = setInterval(async () => {
      const r = await apiGet<{ success: boolean; error: string }>(`${apiBase}/receipts/${stage.tx}`, ctrl.signal).catch(() => null)
      if (!r) {
        if (stage.since && Date.now() - stage.since > RECEIPT_WAIT_MS) setStage((cur) => (cur?.tx === stage.tx ? { ...cur, kind: 'unconfirmed' } : cur))
        return
      }
      setStage((cur) => (cur?.tx === stage.tx ? { ...cur, kind: r.data.success ? 'done' : 'failed', error: r.data.success ? undefined : r.data.error || 'The node refused it.' } : cur))
      if (r.data.success) {
        setAmount('')
        mine.refresh()
        staking.refresh()
      }
    }, 1_500)
    return () => {
      clearInterval(t)
      ctrl.abort()
    }
  }, [stage, apiBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const busy = stage?.kind === 'signing' || stage?.kind === 'block'

  return (
    <div>
      <section className="hero-glow border-b">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" /> Staking · {network.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Stake QRDX with a validator</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Delegate to a validator without running one. Your QRDX joins its pool and counts towards its weight; the pool earns the staking rate every epoch the validator votes, less the
            validator&apos;s commission, and the rewards compound into your shares.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat icon={<PiggyBank className="h-4 w-4" />} label="Staking rate" value={s ? pct(rate) : '—'} sub="a year, before commission" />
            <Stat icon={<Coins className="h-4 w-4" />} label="Delegated" value={s ? compact(String(totalDelegated)) : '—'} sub="QRDX in pools" />
            <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Active validators" value={s ? eligible.length : '—'} sub={s ? `${compact(String(totalWeight))} QRDX weight` : ''} />
            <Stat icon={<Hourglass className="h-4 w-4" />} label="Warm-up" value={s ? epochsAsTime(s.params.warmup_epochs, epochMs) : '—'} sub={s ? `${s.params.warmup_epochs} epochs` : ''} />
            <Stat icon={<Clock className="h-4 w-4" />} label="Unstaking" value={s ? epochsAsTime(unbondEpochs, epochMs) : '—'} sub="unbonding + withdrawal delay" />
          </div>
        </div>
      </section>

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-4 pb-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border bg-card">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Validators</h2>
              <span className="ml-auto text-xs text-muted-foreground">{s?.epoch != null ? `epoch ${s.epoch.toLocaleString()}` : ''}</span>
            </header>
            {staking.error && !s ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">The node does not answer staking requests: {staking.error.message}</p>
            ) : !s ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading validators…</p>
            ) : validators.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No validators on this network.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="num w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b text-left">
                      <th className="px-4 py-2.5 font-medium">Validator</th>
                      <th className="px-3 py-2.5 text-right font-medium">Weight</th>
                      <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Pool</th>
                      <th className="px-3 py-2.5 text-right font-medium">Commission</th>
                      <th className="px-3 py-2.5 text-right font-medium">You earn</th>
                      <th className="w-10 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {validators.map((v) => {
                      const ok = v.status === 'active' && !v.slashed
                      const share = totalWeight && v.status === 'active' ? (Number(v.weight) / totalWeight) * 100 : 0
                      const isSel = chosen?.address === v.address
                      return (
                        <tr
                          key={v.address}
                          onClick={() => ok && setSelected(v.address)}
                          className={cn('border-b last:border-b-0', ok ? 'cursor-pointer hover:bg-accent/40' : 'opacity-60', isSel && 'bg-primary/5')}
                        >
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-1.5 font-mono text-xs">
                              {short(v.address)} <ExplorerLink id={v.address} />
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className={cn('h-1.5 w-1.5 rounded-full', v.slashed ? 'bg-ask' : v.status === 'active' ? 'bg-bid' : 'bg-warn')} />
                              {v.slashed ? 'slashed' : v.status}
                              {v.exit_epoch != null ? ` · exits at epoch ${v.exit_epoch.toLocaleString()}` : ''}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {qrdx(v.weight, 0)}
                            <span className="block text-[11px] text-muted-foreground">{share.toFixed(1)}% of the set</span>
                          </td>
                          <td className="hidden px-3 py-2.5 text-right md:table-cell">
                            {qrdx(v.delegated, 2)}
                            <span className="block text-[11px] text-muted-foreground">
                              {v.pool ? `${v.pool.delegators} delegator${v.pool.delegators === 1 ? '' : 's'}` : 'no delegators yet'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {pct(v.commissionBps)}
                            {v.pool?.next_commission_bps != null && v.pool.next_commission_bps !== v.pool.commission_bps && (
                              <span className="block text-[11px] text-warn">→ {pct(v.pool.next_commission_bps)} next epoch</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-bid">{pct(delegatorBps(rate, v.commissionBps))}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full border', isSel ? 'border-primary bg-primary' : 'border-border')}>
                              {isSel && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
              &quot;You earn&quot; is the staking rate after the validator&apos;s commission, for every epoch the validator&apos;s vote makes it on chain. A validator that misses a vote earns
              nothing for that epoch, and neither does its pool. Rewards are new QRDX.
            </p>
          </section>

          {w.trader && (
            <section className="overflow-hidden rounded-xl border bg-card">
              <header className="flex items-center gap-2 border-b px-4 py-3">
                <Coins className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Your stake</h2>
              </header>
              {!mine.data ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{mine.error ? mine.error.message : 'Loading…'}</p>
              ) : mine.data.stakes.length === 0 && mine.data.payouts.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">You have not delegated yet.</p>
              ) : (
                <div className="divide-y">
                  {mine.data.stakes.map((st) => (
                    <Position key={st.validator} stake={st} staking={s} busy={busy} onUndelegate={(params, label) => void submit('STAKE_UNDELEGATE', params, label)} />
                  ))}
                  {mine.data.payouts.map((p) => {
                    const left = s?.epoch != null ? p.due_epoch - s.epoch : null
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span>
                          <span className="font-medium">{p.kind === 'undelegate' ? 'Undelegation' : p.kind === 'reward' ? 'Reward' : p.kind.replace(/_/g, ' ')}</span>
                          {p.validator && <span className="block text-[11px] text-muted-foreground">from {short(p.validator)}</span>}
                        </span>
                        <span className="num text-right">
                          {qrdx(p.amount, 6)} QRDX
                          <span className="block text-[11px] text-muted-foreground">
                            paid at epoch {p.due_epoch.toLocaleString()}
                            {left != null && left > 0 ? ` · in ${epochsAsTime(left, epochMs)}` : left != null ? ' · this epoch' : ''}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-3">
            <Fact icon={<Hourglass className="h-4 w-4" />} title="Warm-up">
              A delegation joins the pool after {s ? `${s.params.warmup_epochs} epochs (${epochsAsTime(s.params.warmup_epochs, epochMs)})` : 'a few epochs'}, at the pool&apos;s share price. A
              delegation to an address that is no longer a validator by then is refunded.
            </Fact>
            <Fact icon={<AlertTriangle className="h-4 w-4" />} title="Slashing">
              If the validator signs two blocks for one slot or casts conflicting votes, it loses half its stake and its pool loses half its value, including stake on its way out.
            </Fact>
            <Fact icon={<Undo2 className="h-4 w-4" />} title="Unstaking">
              Undelegated shares are valued at the end of the epoch and paid after unbonding and the withdrawal delay ({s ? epochsAsTime(unbondEpochs, epochMs) : '—'}), slashed with the pool until then.
            </Fact>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card">
            <TradeGate action="stake">
              <div className="space-y-4 p-5">
                <h2 className="text-sm font-semibold">Delegate</h2>
                <div className="rounded-lg border bg-background/50 p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Validator</div>
                  {chosen ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{short(chosen.address)}</span>
                      <span className="num text-xs text-bid">{pct(delegatorBps(rate, chosen.commissionBps))} a year</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-muted-foreground">{s ? 'No active validator' : 'Loading…'}</div>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <label htmlFor="stake-amount" className="font-medium">
                      Amount
                    </label>
                    <span className="num text-muted-foreground">
                      Balance {qrdx(balance)} QRDX
                      {max && cmp(dec(max), 0n) > 0 && (
                        <button type="button" onClick={() => setAmount(round(max, 6, 'down'))} className="ml-2 text-primary hover:underline">
                          Max
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center rounded-lg border bg-background focus-within:border-primary/60">
                    <input
                      id="stake-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="0.0"
                      className="num min-w-0 flex-1 bg-transparent px-3 py-2.5 text-lg outline-none"
                    />
                    <span className="px-3 text-sm text-muted-foreground">QRDX</span>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs">
                  <Line k="Earns a year" v={yearly ? `${qrdx(yearly, 4)} QRDX` : '—'} />
                  <Line k="Commission" v={chosen ? pct(chosen.commissionBps) : '—'} />
                  <Line k="Joins the pool" v={s ? (s.epoch != null ? `epoch ${(s.epoch + s.params.warmup_epochs + 1).toLocaleString()} · ${epochsAsTime(s.params.warmup_epochs, epochMs)}` : epochsAsTime(s.params.warmup_epochs, epochMs)) : '—'} />
                  <Line k="To unstake" v={s ? epochsAsTime(unbondEpochs, epochMs) : '—'} />
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!!problem || busy}
                  onClick={() => chosen && void submit('STAKE_DELEGATE', { validator: chosen.address, amount }, `Delegate ${amount} QRDX to ${short(chosen.address)}`)}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {problem ?? 'Delegate'}
                </Button>
                {slot === 'test' && <p className="text-center text-[11px] text-muted-foreground">Testnet QRDX has no value.</p>}

                {stage && <StageNote stage={stage} />}
              </div>
            </TradeGate>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** One pool the account holds shares in: value, warm-up, and undelegating all or part. */
function Position({
  stake,
  staking,
  busy,
  onUndelegate,
}: {
  stake: Mine['stakes'][number]
  staking: Staking | null
  busy: boolean
  onUndelegate: (params: Record<string, string>, label: string) => void
}) {
  const [part, setPart] = useState('')
  const pool = staking?.validators.find((v) => v.address.toLowerCase() === stake.validator.toLowerCase())?.pool ?? null
  const epochMs = staking?.clock?.epochMs
  const warming = stake.warming_up.reduce((sum, x) => sum + dec(x.amount), 0n)
  // Part of the stake, in QRDX: redeemed as shares at the pool's price (rounded down).
  const partShares =
    part && AMOUNT_RE.test(part) && pool && dec(pool.share_price) > 0n ? round(str(div(dec(part), dec(pool.share_price))), 18, 'down') : null
  const partProblem = !part ? null : !partShares ? 'Enter an amount' : cmp(dec(partShares), dec(stake.shares)) > 0 ? 'More than your stake' : null

  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="flex items-center gap-1.5 font-mono text-xs">
            {short(stake.validator)} <ExplorerLink id={stake.validator} />
          </span>
          <span className="num mt-0.5 block text-[11px] text-muted-foreground">
            {qrdx(stake.shares, 6)} shares{pool ? ` at ${qrdx(pool.share_price, 6)}` : ''}
          </span>
        </span>
        <span className="num text-right">
          {qrdx(stake.value, 6)} QRDX
          {warming > 0n && <span className="block text-[11px] text-warn">+ {qrdx(str(warming), 6)} warming up</span>}
        </span>
      </div>
      {stake.warming_up.map((x, i) => {
        const left = staking?.epoch != null ? x.active_from_epoch - staking.epoch : null
        return (
          <p key={i} className="num mt-1 text-[11px] text-muted-foreground">
            {qrdx(x.amount, 6)} QRDX joins at epoch {x.active_from_epoch.toLocaleString()}
            {left != null && left > 0 ? ` · in ${epochsAsTime(left, epochMs)}` : ''}
          </p>
        )
      })}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex h-8 items-center rounded-md border bg-background">
          <input
            value={part}
            onChange={(e) => setPart(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="QRDX"
            inputMode="decimal"
            className="num w-24 bg-transparent px-2 text-xs outline-none"
            aria-label="Amount to undelegate"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busy || !partShares || !!partProblem}
          onClick={() => partShares && onUndelegate({ validator: stake.validator, shares: partShares }, `Undelegate ${part} QRDX from ${short(stake.validator)}`)}
        >
          {partProblem ?? 'Undelegate'}
        </Button>
        <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => onUndelegate({ validator: stake.validator, shares: 'all' }, `Undelegate everything from ${short(stake.validator)}`)}>
          Undelegate all
        </Button>
      </div>
    </div>
  )
}

function StageNote({ stage }: { stage: Stage }) {
  const icon =
    stage.kind === 'done' ? (
      <CheckCircle2 className="h-4 w-4 text-bid" />
    ) : stage.kind === 'failed' ? (
      <XCircle className="h-4 w-4 text-ask" />
    ) : stage.kind === 'unconfirmed' ? (
      <AlertTriangle className="h-4 w-4 text-warn" />
    ) : (
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
    )
  const text =
    stage.kind === 'signing'
      ? 'Approve it in your QRDX Wallet…'
      : stage.kind === 'block'
        ? 'Waiting for a block…'
        : stage.kind === 'done'
          ? 'Done. It shows under Your stake.'
          : stage.kind === 'unconfirmed'
            ? 'No receipt after 30 seconds. The node may have refused it before running it (for example, no QRDX for gas). Check the transaction in the explorer.'
            : stage.error ?? 'Failed.'
  return (
    <div className={cn('rounded-lg border p-3 text-xs', stage.kind === 'failed' ? 'border-ask/30 bg-ask/5' : 'bg-muted/30')}>
      <div className="flex items-start gap-2">
        {icon}
        <div className="min-w-0">
          <div className="font-medium">{stage.label}</div>
          <div className="mt-0.5 text-muted-foreground">{text}</div>
          {stage.tx && <ExplorerLink kind="tx" id={stage.tx} label="View transaction" className="mt-1 text-primary" />}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        <span className="text-muted-foreground/70">{icon}</span>
      </div>
      <div className="num mt-1 text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="num text-right">{v}</span>
    </div>
  )
}

function Fact({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
