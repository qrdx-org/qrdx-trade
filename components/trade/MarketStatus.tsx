'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { ApiRequestError } from '@/lib/hooks/useApi'
import type { ApiAsset } from '@/lib/types'

/** Shown above a market whose base or quote is an unverified token. */
export function UnverifiedBanner({ assets }: { assets: ApiAsset[] }) {
  const unverified = assets.filter((a) => !a.verified)
  if (!unverified.length) return null
  return (
    <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>
        {unverified.map((a) => (
          <span key={a.segment} className="mr-2">
            <b>{a.symbol}</b> is an unverified token at <span className="font-mono break-all">{a.address}</span>.
          </span>
        ))}
        Anyone can create a token with any name. Check the address before you trade.
      </span>
    </div>
  )
}

/** Not-found / ambiguous-symbol page body for a pair URL. */
export function PairError({ error, kind }: { error: Error; kind: 'spot' | 'perp' }) {
  const e = error as ApiRequestError
  const candidates = e.body?.candidates ?? []
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{e.status === 404 ? 'Market not found' : 'Market unavailable'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{e.message}</p>
      {candidates.length > 0 && (
        <div className="mt-6 rounded-lg border text-left">
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            Unverified tokens with that symbol. Symbols are not unique, so these trade by address:
          </p>
          {candidates.map((c) => (
            <Link key={c.address} href={`/trade/${c.address}`} className="block px-4 py-2 text-sm hover:bg-accent">
              <b>{c.symbol}</b> · {c.name} <span className="block font-mono text-xs text-muted-foreground">{c.address}</span>
            </Link>
          ))}
        </div>
      )}
      <Link href={kind === 'spot' ? '/trade' : '/perps'} className="mt-6 inline-block text-sm text-primary hover:underline">
        Browse markets
      </Link>
    </div>
  )
}

export function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-xs tabular ${className ?? ''}`}>{value}</span>
    </div>
  )
}
