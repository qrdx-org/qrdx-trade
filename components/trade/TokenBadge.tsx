import { cn } from '@/lib/utils'
import type { ApiAsset } from '@/lib/types'

const SIZES = { xs: 'h-4 w-4 text-[7px]', sm: 'h-5 w-5 text-[8px]', md: 'h-7 w-7 text-[10px]', lg: 'h-9 w-9 text-xs' }

/** A coloured disc with the ticker's initials. Unverified tokens get a dashed ring. */
export function TokenBadge({
  asset,
  size = 'sm',
  className,
}: {
  asset: Pick<ApiAsset, 'symbol' | 'color' | 'verified'> | null | undefined
  size?: keyof typeof SIZES
  className?: string
}) {
  const label = (asset?.symbol ?? '?').replace(/^0x/, '').slice(0, asset?.symbol && asset.symbol.length <= 4 ? 4 : 3)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white select-none',
        SIZES[size],
        asset && !asset.verified && 'ring-1 ring-dashed ring-amber-500 ring-offset-1 ring-offset-background',
        className
      )}
      style={{ background: asset?.color ?? 'hsl(var(--muted-foreground))' }}
      aria-hidden
    >
      {label.length > 3 ? label.slice(0, 3) : label}
    </span>
  )
}

export function PairBadge({ base, quote, size = 'md' }: { base?: ApiAsset | null; quote?: ApiAsset | null; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-center">
      <TokenBadge asset={base} size={size} />
      <TokenBadge asset={quote} size={size} className="-ml-2 ring-2 ring-background" />
    </span>
  )
}
