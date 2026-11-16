'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, ArrowLeftRight, BarChart3, Droplets, Gauge, Image as ImageIcon, ChevronDown, Landmark, Layers, Menu, PieChart, Rocket, Search, Trophy, Vault, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '@/components/chrome/Logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { MarketSearch, openMarketSearch } from '@/components/trade/MarketSelector'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { AccountSwitcher } from '@/components/accounts/AccountSwitcher'
import { Button } from '@/components/ui/button'
import { SLOTS, slotNetwork } from '@/lib/config'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/** In the bar itself. */
const PRIMARY = [
  { href: '/trade', label: 'Trade', icon: BarChart3 },
  { href: '/perps', label: 'Perps', icon: Gauge },
  { href: '/swap', label: 'Swap', icon: ArrowLeftRight },
  { href: '/pools', label: 'Pools', icon: Droplets },
  { href: '/launch', label: 'Launch', icon: Rocket },
  { href: '/portfolio', label: 'Portfolio', icon: PieChart },
]
/** Under "More": ten links do not fit a laptop's width beside search, network and wallet. */
const MORE = [
  { href: '/accounts', label: 'Accounts', icon: Layers, hint: 'Sub-accounts, transfers, trading keys' },
  { href: '/stake', label: 'Stake', icon: Landmark, hint: 'Delegate QRDX to validators' },
  { href: '/vaults', label: 'Vaults', icon: Vault, hint: 'Follow a trader, share the result' },
  { href: '/nfts', label: 'NFTs', icon: ImageIcon, hint: 'Collections and listings' },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy, hint: 'Traders by profit and volume' },
]
const LINKS = [...PRIMARY, ...MORE]

/** The app's top bar. The only <nav> on the page (tests find the Connect button inside it). */
export function AppNav() {
  const path = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => (setOpen(false), setMore(false)), [path])
  useEffect(() => {
    if (!more) return
    const away = (e: MouseEvent) => !moreRef.current?.contains(e.target as Node) && setMore(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc))
  }, [more])
  const inMore = MORE.some((l) => path.startsWith(l.href))

  return (
    <>
      <nav className="relative z-40 flex h-14 shrink-0 items-center gap-1 border-b bg-card px-3 sm:px-4">
        <Link href="/trade" className="mr-2 flex items-center sm:mr-4" aria-label="QRDX Trade">
          <Wordmark />
        </Link>
        <div className="hidden h-full items-center lg:flex">
          {PRIMARY.map((l) => {
            const active = path.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'relative flex h-full items-center gap-1.5 px-3 text-sm transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <l.icon className="hidden h-4 w-4 2xl:block" />
                {l.label}
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
              </Link>
            )
          })}
          <div ref={moreRef} className="relative h-full">
            <button
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              aria-haspopup="menu"
              className={cn(
                'relative flex h-full items-center gap-1 px-3 text-sm transition-colors',
                inMore || more ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {MORE.find((l) => path.startsWith(l.href))?.label ?? 'More'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', more && 'rotate-180')} />
              {inMore && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
            {more && (
              <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border bg-popover p-1.5 shadow-xl">
                {MORE.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    role="menuitem"
                    className={cn('flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent', path.startsWith(l.href) && 'bg-accent')}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                      <l.icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{l.label}</span>
                      <span className="block text-xs text-muted-foreground">{l.hint}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={openMarketSearch}
            className="hidden h-8 w-52 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground xl:flex 2xl:w-64"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search markets</span>
            <kbd className="ml-auto rounded border bg-muted px-1.5 font-sans text-[10px]">⌘K</kbd>
          </button>
          <button onClick={openMarketSearch} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent xl:hidden" aria-label="Search markets">
            <Search className="h-4 w-4" />
          </button>
          <NetworkSelector />
          <ThemeToggle className="hidden sm:inline-flex" />
          <AccountSwitcher className="hidden sm:block" />
          <ConnectButton />
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </nav>
      {open && (
        <div className="grid grid-cols-3 gap-1 border-b bg-card p-2 lg:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md py-2.5 text-xs',
                path.startsWith(l.href) ? 'bg-accent text-foreground' : 'text-muted-foreground'
              )}
            >
              <l.icon className="h-4 w-4" />
              {l.label}
            </Link>
          ))}
          <div className="col-span-3 mt-1 flex items-center justify-center gap-2 sm:hidden">
            <NetworkSelector className="flex" />
            <ThemeToggle />
          </div>
          <AccountSwitcher named className="col-span-3 flex justify-center sm:hidden" />
        </div>
      )}
      <MarketSearch />
      <NetworkBanner />
      <PhoneStrip />
    </>
  )
}

/**
 * Mainnet / Testnet. With a wallet connected the site follows the wallet's
 * network, so choosing here asks the wallet to switch.
 */
function NetworkSelector({ className }: { className?: string }) {
  const { slot, setSlot } = useNet()
  const w = useWallet()
  return (
    <div
      className={cn('hidden items-center rounded-md border bg-background p-0.5 text-[11px] font-medium sm:flex', className)}
      title={w.status === 'connected' ? 'Follows your wallet; switching asks the wallet' : 'Network shown'}
    >
      {SLOTS.map((s) => (
        <button
          key={s}
          onClick={() => setSlot(s)}
          className={cn(
            'flex items-center gap-1.5 rounded-[5px] px-2 py-1 transition-colors',
            slot === s ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', s === 'main' ? 'bg-bid' : 'bg-warn', slot !== s && 'opacity-40')} />
          {s === 'main' ? 'Mainnet' : slotNetwork(s).id === 'local' ? 'Local' : 'Testnet'}
        </button>
      ))}
    </div>
  )
}

function NetworkBanner() {
  const w = useWallet()
  const { network } = useNet()
  if (w.status !== 'connected' || w.rightNetwork) return w.error ? <ErrorStrip text={w.error} /> : null
  return (
    <div className="flex items-center justify-center gap-3 border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 text-warn" />
      Your wallet is on {w.chain?.name ?? 'another network'}. This site trades on {network.name}.
      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={w.switchNetwork}>
        Switch network
      </Button>
    </div>
  )
}

/** Connected through a phone whose app is closed: requests wait until it is opened. */
function PhoneStrip() {
  const w = useWallet()
  if (w.connection !== 'remote' || w.status !== 'connected' || w.phone?.peerOnline !== false) return null
  return (
    <div className="border-b border-warn/30 bg-warn/10 px-3 py-1 text-center text-xs">
      QRDX Wallet on your phone is closed. Open it to approve orders; anything you submit waits for it.
    </div>
  )
}

function ErrorStrip({ text }: { text: string }) {
  return <div className="border-b border-ask/30 bg-ask/10 px-3 py-1.5 text-center text-xs text-ask">{text}</div>
}
