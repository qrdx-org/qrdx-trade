'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, KeyRound, Layers, Percent, Plus, ShieldOff } from 'lucide-react'
import { AccountLabel, usdText } from '@/components/accounts/AccountBits'
import { useAccounts } from '@/components/accounts/AccountsContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccountControl } from '@/components/trade/TradingAccount'
import { fixed, compact } from '@/lib/format'
import { useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`
const pct = (r: string | undefined) => (r === undefined ? '—' : `${(Number(r) * 100).toFixed(3)} %`)

/** One action at a time, with its outcome under it. */
function useAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>, ok = 'Submitted: it applies with the next block.') => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: ok })
      return true
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
      return false
    } finally {
      setBusy(null)
    }
  }
  const note = msg && <p className={cn('mt-2 text-xs', msg.ok ? 'text-bid' : 'text-ask')}>{msg.text}</p>
  return { busy, run, note }
}

function Card({ icon: Icon, title, sub, children }: { icon: typeof Layers; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * The wallet account's tools of the 2026-10 node (docs/TRADING_FEATURES.md): sub-accounts (managed
 * on /accounts), fee tier and referrals, trading keys (agents), and the dead man's switch.
 */
export function AccountTools() {
  const control = useAccountControl()
  if (!control.data) return null
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <SubAccounts />
      <FeesAndReferrals />
      <TradingKeys />
      <DeadMansSwitch />
    </div>
  )
}

/** The accounts this wallet signs for, with their value: one click trades as one; the rest is on /accounts. */
function SubAccounts() {
  const w = useWallet()
  const { accounts, usd, maxSubaccounts, openTransfer, openCreate } = useAccounts()
  const subs = accounts.filter((a) => a.kind !== 'main')
  return (
    <Card icon={Layers} title="Sub-accounts" sub={`Separate balances, margin and orders, signed for by this wallet. ${subs.filter((a) => a.kind === 'sub').length} of ${maxSubaccounts}.`}>
      {subs.length === 0 ? (
        <p className="text-xs text-muted-foreground">None yet. One per strategy keeps its risk away from the rest of your funds.</p>
      ) : (
        <ul className="-mx-1 space-y-0.5 text-xs">
          {subs.map((a) => {
            const active = w.tradingAccount?.toLowerCase() === a.address.toLowerCase()
            return (
              <li key={a.address}>
                <button
                  type="button"
                  onClick={() => w.setActingAs(active ? null : a.address)}
                  className={cn('flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent', active && 'bg-accent')}
                >
                  <AccountLabel account={a} className="flex-1" />
                  <span className="num text-muted-foreground">{usdText(usd(a))}</span>
                  <span className={cn('w-16 text-right', active ? 'font-medium' : 'text-muted-foreground')}>{active ? 'Trading' : 'Trade as'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={openCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openTransfer()} disabled={!subs.length}>
          <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Transfer
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" asChild>
          <Link href="/accounts">Manage accounts</Link>
        </Button>
      </div>
    </Card>
  )
}

export function FeesAndReferrals() {
  const w = useWallet()
  const control = useAccountControl()
  const fees = control.data?.fees
  const { busy, run, note } = useAction()
  const [code, setCode] = useState('')
  const [join, setJoin] = useState('')
  if (!fees) return null
  const volume = Number(fees.volume ?? 0)
  const next = fees.tiers.find((t) => Number(t.volume) > volume)
  const discount = `${Number(fees.referral.referee_discount) * 100} %`
  const valid = (c: string) => /^[a-z0-9_]{3,16}$/.test(c)
  return (
    <Card icon={Percent} title="Fees and referrals" sub={`Rates follow your perps volume over the last ${fees.volume_days} days; spot books charge the same.`}>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat k="14-day volume" v={compact(volume)} />
        <Stat k="Taker" v={pct(fees.taker)} />
        <Stat k="Maker" v={pct(fees.maker)} />
      </div>
      {next && <p className="mt-2 text-xs text-muted-foreground">Next tier at {compact(Number(next.volume))}: {pct(next.taker)} taker, {pct(next.maker)} maker.</p>}
      <div className="mt-3 space-y-2 text-xs">
        {fees.referral_code ? (
          <p>
            Your referral code: <span className="font-mono font-medium">{fees.referral_code}</span>. You earn {Number(fees.referral.referrer_share) * 100} % of the fees the accounts using it pay.
          </p>
        ) : (
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="Take a referral code (a-z, 0-9, _)" className="h-8 text-xs" maxLength={16} />
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!busy || !valid(code)} onClick={() => void run('reg', async () => { await w.sendExchange({ op: 'REFERRAL_REGISTER', params: { code }, label: `Take the referral code ${code}` }); setTimeout(control.refresh, 2000) })}>
              {busy === 'reg' ? '…' : 'Take'}
            </Button>
          </div>
        )}
        {fees.referrer ? (
          <p className="text-muted-foreground">
            Referred by {short(fees.referrer)}: {discount} off your fees on the first {compact(Number(fees.referral.volume_cap))} of volume ({compact(Number(fees.referred_volume ?? 0))} used).
          </p>
        ) : volume < Number(fees.referral.join_before_volume) ? (
          <div className="flex gap-2">
            <Input value={join} onChange={(e) => setJoin(e.target.value.toLowerCase())} placeholder={`A referral code: ${discount} off your fees`} className="h-8 text-xs" maxLength={16} />
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!busy || !valid(join)} onClick={() => void run('join', async () => { await w.sendExchange({ op: 'REFERRAL_JOIN', params: { code: join }, label: `Use the referral code ${join}` }); setTimeout(control.refresh, 2000) })}>
              {busy === 'join' ? '…' : 'Use'}
            </Button>
          </div>
        ) : null}
      </div>
      {note}
    </Card>
  )
}

export function TradingKeys() {
  const w = useWallet()
  const control = useAccountControl()
  const agents = control.data?.agents ?? []
  const { busy, run, note } = useAction()
  const now = Date.now() / 1000
  return (
    <Card icon={KeyRound} title="Trading keys" sub="Keys that may trade for this account (never withdraw): one-click trading in a browser, or a bot. At most 10.">
      {agents.length === 0 ? (
        <p className="text-xs text-muted-foreground">None. Turn on one-click trading above an order form to add this browser.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {agents.map((a) => {
            const until = Number(a.valid_until)
            const mine = w.oneClick?.address.toLowerCase() === a.agent.toLowerCase()
            const expired = until > 0 && until < now
            return (
              <li key={a.agent} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{a.name || 'Unnamed'}</span>
                  {mine && <span className="ml-1 rounded bg-bid/10 px-1 text-[10px] text-bid">this browser</span>}
                  <span className="block font-mono text-muted-foreground">{short(a.agent)}</span>
                  <span className="block text-muted-foreground">
                    {until === 0 ? 'Until revoked' : expired ? 'Expired' : `Until ${new Date(until * 1000).toLocaleString()}`}
                    {a.max_notional_per_day ? ` · ${fixed(a.placed_today ?? '0', 0)} of ${fixed(a.max_notional_per_day, 0)} a day` : ''}
                  </span>
                </span>
                {!expired && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      void run(a.agent, async () => {
                        if (mine) await w.disableOneClick()
                        else await w.sendExchange({ op: 'AGENT_REVOKE', params: { agent: a.agent }, label: `Revoke trading key ${short(a.agent)}` })
                        setTimeout(control.refresh, 2000)
                      })
                    }
                    className="rounded border px-2 py-0.5 hover:border-ask/50 hover:text-ask disabled:opacity-50"
                  >
                    {busy === a.agent ? '…' : 'Revoke'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {note}
    </Card>
  )
}

/** SCHEDULE_CANCEL: cancel every order, trigger and TWAP at a time unless renewed (Hyperliquid's dead man's switch). */
export function DeadMansSwitch() {
  const w = useWallet()
  const { busy, run, note } = useAction()
  const arm = (minutes: number) =>
    run(String(minutes), () =>
      w.sendExchange({
        op: 'SCHEDULE_CANCEL',
        params: { time: Math.floor(Date.now() / 1000) + minutes * 60 },
        label: `Cancel all orders in ${minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`} unless renewed`,
      })
    , 'Armed: everything is cancelled then unless you arm it again first.')
  return (
    <Card icon={ShieldOff} title="Dead man's switch" sub="Cancel every order, trigger and TWAP of the trading account at a time, unless you renew it first: for bots and for stepping away.">
      <div className="flex flex-wrap gap-2">
        {[5, 60, 24 * 60].map((m) => (
          <Button key={m} size="sm" variant="outline" className="h-8 text-xs" disabled={!!busy} onClick={() => void arm(m)}>
            {busy === String(m) ? '…' : `In ${m >= 60 ? `${m / 60} h` : `${m} min`}`}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!!busy} onClick={() => void run('off', () => w.sendExchange({ op: 'SCHEDULE_CANCEL', params: {}, label: "Turn off the dead man's switch" }), 'Turned off.')}>
          {busy === 'off' ? '…' : 'Turn off'}
        </Button>
      </div>
      {note}
    </Card>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] text-muted-foreground">{k}</div>
      <div className="num font-medium">{v}</div>
    </div>
  )
}
