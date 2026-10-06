import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Wordmark } from '@/components/chrome/Logo'

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Trade',
    links: [
      { label: 'Spot markets', href: '/trade' },
      { label: 'Perpetuals', href: '/perps' },
      { label: 'Swap', href: '/swap' },
      { label: 'Liquidity pools', href: '/pools' },
      { label: 'Launch a coin', href: '/launch' },
      { label: 'Portfolio', href: '/portfolio' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'API reference', href: 'https://github.com/qrdx-org/qrdx-trade/blob/main/docs/API.md' },
      { label: 'API · mainnet', href: '/api/v1' },
      { label: 'API · testnet', href: '/api/v1-test' },
      { label: 'Source', href: 'https://github.com/qrdx-org/qrdx-trade' },
    ],
  },
  {
    title: 'QRDX',
    links: [
      { label: 'qrdx.org', href: 'https://qrdx.org' },
      { label: 'Wallet', href: 'https://wallet.qrdx.org' },
      { label: 'Explorer', href: 'https://explorer.qrdx.org' },
      { label: 'Whitepaper', href: 'https://qrdx.org/whitepaper' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub', href: 'https://github.com/qrdx-org' },
      { label: 'X / Twitter', href: 'https://twitter.com/qrdx' },
      { label: 'Discord', href: 'https://discord.gg/qrdx' },
    ],
  },
]

/** Footer of the content pages (markets, pools, launch, portfolio). The terminal has the status bar instead. */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            The exchange of the QRDX chain. Every order is signed with a post-quantum key and settled on chain.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> ML-DSA-65 signatures
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{c.title}</h3>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith('/') && !l.href.startsWith('/api') ? (
                    <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  ) : (
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} QRDX Foundation</span>
          <span>Markets, books and fills come from the QRDX chain. USD index prices are labelled reference data.</span>
        </div>
      </div>
    </footer>
  )
}
