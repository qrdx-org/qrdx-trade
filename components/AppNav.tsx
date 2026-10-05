'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { Button } from '@/components/ui/button'
import { SLOTS, slotNetwork } from '@/lib/config'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/trade', label: 'Trade', match: ['/trade'] },
  { href: '/perps', label: 'Perps', match: ['/perps'] },
  { href: '/swap', label: 'Swap', match: ['/swap'] },
  { href: '/pools', label: 'Pools', match: ['/pools'] },
  { href: '/launch', label: 'Launch', match: ['/launch'] },
  { href: '/portfolio', label: 'Portfolio', match: ['/portfolio'] },
]

/** The compact top bar of the trading app. */
export function AppNav() {
  const path = usePathname() ?? ''
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        <Link href="/trade" className="mr-3 flex items-center gap-2 font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-6 w-6 rounded" />
          <span className="hidden sm:inline">QRDX Trade</span>
        </Link>
        <div className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                l.match.some((m) => path.startsWith(m))
                  ? 'text-foreground bg-accent'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NetworkSelector />
          <ThemeToggle />
          <ConnectButton />
          <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </nav>
      {open && (
        <div className="md:hidden border-b bg-background px-3 py-2 flex flex-col">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2 text-sm">
              {l.label}
            </Link>
          ))}
        </div>
      )}
      <NetworkBanner />
      <PhoneStrip />
      <TestnetStrip />
    </>
  )
}

/**
 * Mainnet / Testnet. With a wallet connected the site follows the wallet's
 * network, so choosing here asks the wallet to switch.
 */
function NetworkSelector() {
  const { slot, setSlot } = useNet()
  const w = useWallet()
  return (
    <div
      className="flex rounded-full border p-0.5 text-[11px]"
      title={w.status === 'connected' ? 'Follows your wallet; switching asks the wallet' : 'Network shown'}
    >
      {SLOTS.map((s) => (
        <button
          key={s}
          onClick={() => setSlot(s)}
          className={cn(
            'rounded-full px-2 py-0.5',
            slot === s
              ? s === 'main'
                ? 'bg-accent text-foreground'
                : 'bg-amber-500/15 text-amber-500'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
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
    <div className="flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
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
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 text-center text-xs">
      QRDX Wallet on your phone is closed. Open it to approve orders; anything you submit waits for it.
    </div>
  )
}

function TestnetStrip() {
  const { slot, network } = useNet()
  if (slot !== 'test') return null
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-center text-[11px] text-amber-600 dark:text-amber-400">
      {network.name}: test tokens with no value. API: /api/v1-test
    </div>
  )
}

function ErrorStrip({ text }: { text: string }) {
  return <div className="border-b border-ask/30 bg-ask/10 px-3 py-1.5 text-center text-xs text-ask">{text}</div>
}
