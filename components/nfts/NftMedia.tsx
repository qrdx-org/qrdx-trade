'use client'

import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { resolveUri, type NftMetadata } from '@/lib/nft-market'
import { cn } from '@/lib/utils'

const cache = new Map<string, Promise<NftMetadata | null>>()

/** The JSON a metadata URI points at (https, ipfs, ar or data:), fetched once per page. */
export function loadMetadata(uri: string | null | undefined): Promise<NftMetadata | null> {
  const url = resolveUri(uri)
  if (!url) return Promise.resolve(null)
  let p = cache.get(url)
  if (!p) {
    p = fetch(url, { referrerPolicy: 'no-referrer' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && typeof j === 'object' ? (j as NftMetadata) : null))
      .catch(() => null)
    cache.set(url, p)
  }
  return p
}

export function useMetadata(uri: string | null | undefined): NftMetadata | null | undefined {
  const [state, setState] = useState<{ uri: string | null | undefined; meta: NftMetadata | null } | null>(null)
  useEffect(() => {
    let live = true
    loadMetadata(uri).then((meta) => live && setState({ uri, meta }))
    return () => {
      live = false
    }
  }, [uri])
  return state?.uri === uri ? state.meta : undefined
}

/** An NFT's or a collection's image from its metadata; its name's initials while loading or without one. */
export function NftImage({ uri, name, className, rounded = 'rounded-lg' }: { uri: string | null | undefined; name: string; className?: string; rounded?: string }) {
  const meta = useMetadata(uri)
  // A URI that is itself an image (no JSON) is shown directly.
  const direct = uri && /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(uri) ? resolveUri(uri) : null
  const src = direct ?? resolveUri(meta?.image)
  const [broken, setBroken] = useState<string | null>(null)
  if (src && broken !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={meta?.name ?? name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(src)} className={cn('aspect-square w-full bg-muted object-cover', rounded, className)} />
    )
  }
  return (
    <div className={cn('flex aspect-square w-full items-center justify-center bg-gradient-to-br from-muted to-accent text-muted-foreground', rounded, className)} aria-label={name}>
      {meta === undefined && uri ? (
        <span className="h-4 w-4 animate-pulse rounded-full bg-muted-foreground/30" />
      ) : src ? (
        <ImageOff className="h-5 w-5" />
      ) : (
        <span className="text-lg font-semibold uppercase tracking-tight">{name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || '#'}</span>
      )}
    </div>
  )
}

export const shortAddr = (a: string | null | undefined) => (!a ? '—' : a.length > 20 ? `${a.slice(0, a.startsWith('0xPQ') ? 8 : 6)}…${a.slice(-4)}` : a)
