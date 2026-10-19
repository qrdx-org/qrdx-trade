'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { useApi } from '@/lib/hooks/useApi'
import { resolveUri, sameAccount } from '@/lib/nft-market'
import type { CollectionStats, NftItem, NftSale } from '@/lib/server/nfts'
import type { NodeNftCollection } from '@/lib/server/node'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'
import { ItemDialog } from './ItemDialog'
import { Empty, ItemCard, SalesTable } from './MarketHome'
import { MintPanel } from './CreateCollection'
import { NftImage, shortAddr, useMetadata } from './NftMedia'

interface CollectionResponse {
  market: string | null
  collection: NodeNftCollection
  items: NftItem[]
  truncated: boolean
  stats: CollectionStats
  sales: NftSale[]
}

type Filter = 'all' | 'listed' | 'mine'
type Sort = 'price' | 'id' | 'recent'

/** One collection: what it is, its NFTs (filter, sort), and its sales; ?item=ID opens one. */
export function CollectionView({ address }: { address: string }) {
  const { apiBase } = useNet()
  const w = useWallet()
  const router = useRouter()
  const params = useSearchParams()
  const data = useApi<CollectionResponse>(`${apiBase}/nfts/${address}`, 15_000)
  const d = data.data
  const meta = useMetadata(d?.collection.uri)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('price')
  const openId = params.get('item')
  const open = (id: string | null) => router.replace(id ? `/nfts/${address}?item=${id}` : `/nfts/${address}`, { scroll: false })
  const canMint = !!d && !!w.trader && sameAccount(d.collection.mint_authority, w.trader)

  const items = useMemo(() => {
    const list = (d?.items ?? []).filter((i) => (filter === 'listed' ? i.listing?.live : filter === 'mine' ? w.trader && sameAccount(i.owner, w.trader) : true))
    const qrdxPrice = (i: NftItem) => (i.listing?.live ? Number(i.listing.priceDisplay) : Infinity)
    return [...list].sort((a, b) =>
      sort === 'price' ? qrdxPrice(a) - qrdxPrice(b) || Number(a.token_id) - Number(b.token_id) : sort === 'recent' ? b.minted_height - a.minted_height : Number(a.token_id) - Number(b.token_id)
    )
  }, [d, filter, sort, w.trader])

  if (!d) return <p className="py-20 text-center text-sm text-muted-foreground">{data.error ? data.error.message : 'Loading the collection…'}</p>
  const c = d.collection
  const site = resolveUri(meta?.external_url)
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <Link href="/nfts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> NFT market
      </Link>
      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-28 shrink-0">
          <NftImage uri={c.uri} name={c.name} rounded="rounded-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {meta?.name ?? c.name} <span className="text-base font-normal text-muted-foreground">{c.symbol}</span>
          </h1>
          {meta?.description && <p className="mt-1 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{meta.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Creator <span className="font-mono">{shortAddr(c.creator)}</span> <ExplorerLink id={c.creator} />
            </span>
            <span>Royalty {c.royalty_bps ? `${(c.royalty_bps / 100).toFixed(2)} %` : 'none'}</span>
            <span>{c.mint_authority ? (c.max_supply ? `Up to ${c.max_supply.toLocaleString()} items` : 'Can mint more') : 'Supply fixed: no more can be minted'}</span>
            <span>{c.update_authority ? 'Metadata editable by its authority' : 'Metadata frozen'}</span>
            {c.non_transferable && <span className="text-warn">Soulbound: cannot be sold</span>}
            {site && (
              <a href={site} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                Website <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <ExplorerLink id={c.collection} label="Explorer" />
          </div>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile k="Floor" v={d.stats.floor ? `${Number(d.stats.floor).toLocaleString('en-US', { maximumFractionDigits: 6 })} QRDX` : '—'} />
        <Tile k="Listed" v={`${d.stats.listed} / ${c.supply.toLocaleString()}`} />
        <Tile k="Owners" v={d.stats.owners != null ? d.stats.owners.toLocaleString() : '—'} />
        <Tile k="Sales" v={d.stats.sales.toLocaleString()} />
        <Tile k="Volume" v={`${Number(d.stats.volume).toLocaleString('en-US', { maximumFractionDigits: 4 })} QRDX`} />
      </div>

      {canMint && (
        <div className="mt-5">
          <MintPanel collection={c} onMinted={data.refresh} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
          {(
            [
              ['all', 'All'],
              ['listed', 'Buy now'],
              ['mine', 'Yours'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn('rounded px-3 py-1', filter === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>
              {label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Sort">
          <option value="price">Price: low to high</option>
          <option value="id">Token id</option>
          <option value="recent">Recently minted</option>
        </select>
      </div>

      <div className="mt-3">
        {items.length === 0 ? (
          <Empty text={filter === 'listed' ? 'Nothing is listed right now.' : filter === 'mine' ? 'You own none of these.' : 'No NFTs minted yet.'} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((i) => (
              <ItemCard key={i.token_id} item={i} collectionName={c.name} onOpen={() => open(i.token_id)} />
            ))}
          </div>
        )}
        {d.truncated && <p className="mt-2 text-[11px] text-muted-foreground">Showing the first 2,000 NFTs of the collection.</p>}
      </div>

      {d.sales.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Sales</h2>
          <SalesTable sales={d.sales} names={new Map([[c.collection.toLowerCase(), c.name]])} />
        </section>
      )}
      {openId && /^\d+$/.test(openId) && <ItemDialog collection={c.collection} tokenId={openId} onClose={() => open(null)} onChanged={data.refresh} />}
    </main>
  )
}

function Tile({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="num text-sm font-semibold">{v}</div>
    </div>
  )
}
