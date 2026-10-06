import { cn } from '@/lib/utils'
import type { ApiAsset } from '@/lib/types'

const SIZES = {
  xs: 'h-4 w-4 text-[6.5px]',
  sm: 'h-5 w-5 text-[7.5px]',
  md: 'h-7 w-7 text-[9.5px]',
  lg: 'h-9 w-9 text-[11px]',
  xl: 'h-11 w-11 text-[13px]',
}
type Size = keyof typeof SIZES

/** Verified assets with a logo in public/tokens. */
const LOGOS = new Set(['qrdx', 'btc', 'eth', 'usdc', 'usdt', 'sol', 'bnb', 'avax', 'link', 'uni', 'ada', 'dot', 'doge'])

/**
 * A token's mark: the asset's logo when it is verified and has one, otherwise a
 * coloured disc with the ticker's initials. Unverified tokens always get the disc
 * and a dashed warning ring, so a copycat can never borrow a real logo.
 */
export function TokenBadge({
  asset,
  size = 'sm',
  className,
}: {
  asset: (Pick<ApiAsset, 'symbol' | 'color' | 'verified'> & { slug?: string | null }) | null | undefined
  size?: Size
  className?: string
}) {
  const slug = asset?.verified ? asset.slug ?? logoSlug(asset.symbol) : null
  if (slug && LOGOS.has(slug)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/tokens/${slug}.svg`} alt="" aria-hidden className={cn('shrink-0 rounded-full bg-background select-none', SIZES[size], className)} />
    )
  }
  const label = (asset?.symbol ?? '?').replace(/^0x/, '').replace(/^[qw](?=[A-Z])/, '').slice(0, 3)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase text-white select-none',
        SIZES[size],
        asset && !asset.verified && 'outline-1 outline-dashed outline-offset-1 outline-warn',
        className
      )}
      style={{ background: asset?.color ?? 'hsl(var(--muted-foreground))' }}
      aria-hidden
    >
      {label}
    </span>
  )
}

/** qBTC / wQRDX style on-chain symbols map to their asset's logo. */
function logoSlug(symbol: string): string | null {
  const s = symbol.toLowerCase().replace(/^[qw](?=[a-z]{3})/, '')
  return LOGOS.has(s) ? s : null
}

export function PairBadge({ base, quote, size = 'md' }: { base?: ApiAsset | null; quote?: ApiAsset | null; size?: Size }) {
  return (
    <span className="inline-flex items-center">
      <TokenBadge asset={base} size={size} className="relative z-[1] ring-2 ring-card" />
      <TokenBadge asset={quote} size={size} className={cn('ring-2 ring-card', size === 'xs' ? '-ml-1' : size === 'xl' ? '-ml-3' : '-ml-2')} />
    </span>
  )
}
