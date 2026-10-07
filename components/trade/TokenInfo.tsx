'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BadgeCheck, Check, Copy, ExternalLink, ShieldAlert } from 'lucide-react'
import { TokenBadge } from '@/components/trade/TokenBadge'
import { shortAddress } from '@/lib/assets'
import { compact, percent, tone, usd } from '@/lib/format'
import { useApi } from '@/lib/hooks/useApi'
import type { ApiAsset, IndexPrice, PoolSummary } from '@/lib/types'
import { socialLinks, type ProfileFields } from '@/relay/src/profile-claim'
import { useNet } from '@/lib/wallet/WalletContext'
import { explorerLink } from '@/lib/config'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { cn } from '@/lib/utils'

interface AssetDetail extends ApiAsset {
  token: {
    totalSupply: string
    maxSupply: string | null
    creator: string
    mintAuthority: string | null
    freezeAuthority: string | null
    createdHeight: number
  } | null
  index: IndexPrice | null
  /** What the token's creator published (docs/PROFILES.md); signed by them, not checked. */
  profile: (ProfileFields & { signer: string; updatedAt: number }) | null
}

/** The Info tab: both tokens of the market as the chain records them, and its pools. */
export function MarketInfo({ base, quote, pools }: { base: ApiAsset; quote: ApiAsset; pools: PoolSummary[] }) {
  return (
    <div className="grid gap-3 p-3 md:grid-cols-[1fr_1fr_1.1fr]">
      <AssetCard asset={base} />
      <AssetCard asset={quote} />
      <div className="rounded-lg border p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pools</h4>
        {pools.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No pool for this pair yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {pools.map((p) => (
              <li key={p.poolId}>
                <Link href={`/pools/${p.poolId}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent">
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{(Number(p.feeRate) * 100).toFixed(2).replace(/\.?0+$/, '')}%</span>
                    <span className="font-mono text-muted-foreground">{p.poolId.slice(0, 10)}…</span>
                  </span>
                  <span className="num text-muted-foreground">
                    {p.positions} position{p.positions === 1 ? '' : 's'}
                    {p.paused && <span className="ml-2 text-warn">paused</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Orders rest on the QRDX order book; market orders take the better of the book and these pools.
        </p>
      </div>
    </div>
  )
}

function AssetCard({ asset }: { asset: ApiAsset }) {
  const { apiBase, network } = useNet()
  const { data } = useApi<AssetDetail>(asset.listed ? `${apiBase}/assets/${asset.segment}` : null, 60_000)
  const t = data?.token
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2.5">
        <TokenBadge asset={asset} size="lg" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {asset.name}
            {asset.verified ? (
              <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-warn" aria-label="Unverified" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {asset.symbol}
            {asset.onChainSymbol && asset.onChainSymbol !== asset.symbol && ` · on chain ${asset.onChainSymbol}`}
          </div>
        </div>
        {data?.index && (
          <div className="ml-auto text-right leading-tight">
            <div className="num text-sm font-medium">{usd(data.index.price)}</div>
            <div className={cn('num text-[11px]', tone(data.index.change24h))}>{percent(data.index.change24h)}</div>
          </div>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <Row k="Contract">{asset.address ? <Address value={asset.address} href={explorerLink(network, 'address', asset.address)} /> : 'not on this network'}</Row>
        <Row k="Decimals">{asset.decimals}</Row>
        {t && (
          <>
            <Row k="Supply">
              {compact(t.totalSupply)}
              {t.maxSupply ? ` / ${compact(t.maxSupply)} max` : ''}
            </Row>
            <Row k="Minting">
              {t.mintAuthority ? <span className="text-warn">open · {shortAddress(t.mintAuthority, 4)}</span> : <span className="text-bid">fixed supply</span>}
            </Row>
            <Row k="Freezing">{t.freezeAuthority ? <span className="text-warn">possible</span> : 'none'}</Row>
            <Row k="Created">
              block {t.createdHeight.toLocaleString()} by <ExplorerLink id={t.creator} label={shortAddress(t.creator, 4)} className="font-mono" />
            </Row>
          </>
        )}
        <Row k="Status">{asset.verified ? 'Verified asset' : <span className="text-warn">Unverified: check the contract</span>}</Row>
      </dl>
      {data?.profile && (data.profile.description || socialLinks(data.profile).length > 0) && (
        <div className="mt-3 border-t pt-3">
          <div className="text-[11px] text-muted-foreground">From the creator · signed by them, not checked by QRDX</div>
          {data.profile.description && <p className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed">{data.profile.description}</p>}
          {socialLinks(data.profile).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {socialLinks(data.profile).map((l) => (
                <a key={l.kind} href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  {l.label} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="num min-w-0 truncate text-right">{children}</dd>
    </>
  )
}

function Address({ value, href }: { value: string; href: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">{shortAddress(value, 6)}</span>
      <button
        aria-label="Copy address"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Open in explorer" className="text-muted-foreground hover:text-foreground">
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  )
}
