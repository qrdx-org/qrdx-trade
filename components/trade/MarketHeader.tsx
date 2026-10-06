'use client'

import { Star } from 'lucide-react'
import { useFavorites } from '@/lib/hooks/useFavorites'
import { usePriceFlash } from '@/lib/hooks/usePriceFlash'
import { cn } from '@/lib/utils'

export interface HeaderStat {
  label: string
  value: React.ReactNode
  className?: string
  title?: string
}

/**
 * The bar over a terminal: star, market picker, the price (washed green or red
 * for a moment when it moves), and the market's numbers.
 */
export function MarketHeader({
  path,
  selector,
  price,
  priceRaw,
  priceClass,
  priceSub,
  stats,
  right,
}: {
  path: string
  selector: React.ReactNode
  price: string
  priceRaw: string | null
  priceClass?: string
  priceSub?: React.ReactNode
  stats: HeaderStat[]
  right?: React.ReactNode
}) {
  const fav = useFavorites()
  const flash = usePriceFlash(priceRaw)
  const starred = fav.has(path)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-2 py-2 md:flex-nowrap lg:rounded-lg lg:border">
      <button
        onClick={() => fav.toggle(path)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-warn"
        aria-label={starred ? 'Remove from favorites' : 'Add to favorites'}
        title={starred ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star className={cn('h-4 w-4', starred && 'fill-warn text-warn')} />
      </button>
      <div className="shrink-0">{selector}</div>
      <div className="mx-2 hidden h-9 w-px bg-border sm:block" />
      <div className={cn('shrink-0 rounded-md px-2 py-0.5 leading-tight', flash)}>
        <div className={cn('num text-xl font-semibold tracking-tight', priceClass)}>{price}</div>
        {priceSub && <div className="text-[11px] text-muted-foreground">{priceSub}</div>}
      </div>
      <div className="order-last flex min-w-0 basis-full items-center gap-6 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] md:order-none md:flex-1 md:basis-auto">
        {stats.map((s) => (
          <div key={s.label} className="shrink-0 leading-tight" title={s.title}>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
            <div className={cn('num mt-0.5 text-[13px] font-medium', s.className)}>{s.value}</div>
          </div>
        ))}
      </div>
      {right && <div className="hidden shrink-0 items-center gap-1 xl:flex">{right}</div>}
    </div>
  )
}
