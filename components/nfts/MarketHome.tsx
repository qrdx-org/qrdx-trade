'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Image as ImageIcon, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { useApi } from '@/lib/hooks/useApi'
import { sameAccount } from '@/lib/nft-market'
import type { CollectionStats, NftItem, NftSale } from '@/lib/server/nfts'
import type { NodeNftCollection } from '@/lib/server/node'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'
import { DeployMarket } from './DeployMarket'
import { ItemDialog, display } from './ItemDialog'
import { NftImage, shortAddr, useMetadata } from './NftMedia'

interface Overview {
  market: string | null
  collections: (NodeNftCollection & { stats: CollectionStats })[]
  sales: NftSale[]
}

/**
 * The NFT market: every native collection on the network with its floor, listings and volume,
 * recent sales, and the connected account's NFTs. Prices are what sellers set; nothing is
 * estimated.
 */
export function MarketHome() {
  const { apiBase, network } = useNet()
  const w = useWallet()
  const [tab, setTab] = useState<'collections' | 'mine' | 'sales'>('collections')
  const data = useApi<Overview>(`${apiBase}/nfts`, 15_000)
  const mine = useApi<{ items: (NftItem & { marketApproved: boolean })[] }>(w.trader ? `${apiBase}/nfts/accounts/${w.trader}` : null, 15_000)
  const [open, setOpen] = useState<{ collection: string; tokenId: string } | null>(null)
  const d = data.data
  const names = new Map((d?.collections ?? []).map((c) => [c.collection.toLowerCase(), c.name]))

  return (
    <main>
      <section className="hero-glow border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 pb-8 pt-10">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" /> NFTs
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">NFT market</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              QRDX&apos;s native NFTs, bought and sold at fixed prices in QRDX or a token. A sale moves the NFT, the payment and the creator&apos;s royalty in one
              transaction; nothing is held in escrow, and the seller keeps the NFT until it sells. On {network.name}.
            </p>
          </div>
          <Button asChild>
            <Link href="/nfts/create">
              <Plus className="mr-1.5 h-4 w-4" /> Create a collection
            </Link>
          </Button>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {d && !d.market && <DeployMarket onDeployed={data.refresh} />}
        {d?.market && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Market contract <span className="font-mono">{shortAddr(d.market)}</span> <ExplorerLink id={d.market} />
          </p>
        )}

        <div className="flex gap-1 border-b text-sm">
          {(
            [
              ['collections', `Collections${d ? ` (${d.collections.length})` : ''}`],
              ['mine', `Your NFTs${mine.data ? ` (${mine.data.items.length})` : ''}`],
              ['sales', 'Recent sales'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={cn('-mb-px border-b-2 px-3 py-2', tab === id ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>

        {!d ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{data.error ? data.error.message : 'Loading collections…'}</p>
        ) : tab === 'collections' ? (
          d.collections.length === 0 ? (
            <Empty text="No NFT collections on this network yet." action={<Link href="/nfts/create" className="underline">Create the first one</Link>} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[...d.collections]
                .sort((a, b) => Number(b.stats.volume) - Number(a.stats.volume) || b.stats.listed - a.stats.listed || b.supply - a.supply)
                .map((c) => (
                  <CollectionCard key={c.collection} c={c} />
                ))}
            </div>
          )
        ) : tab === 'mine' ? (
          !w.trader ? (
            <Empty text="Connect the QRDX Wallet to see your NFTs." />
          ) : !mine.data ? (
            <Empty text={mine.error ? mine.error.message : 'Loading your NFTs…'} />
          ) : mine.data.items.length === 0 ? (
            <Empty text="Your trading account owns no NFTs on this network." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {mine.data.items.map((n) => (
                <ItemCard key={`${n.collection}:${n.token_id}`} item={n} collectionName={names.get(n.collection.toLowerCase()) ?? n.collection_name ?? ''} onOpen={() => setOpen({ collection: n.collection, tokenId: n.token_id })} />
              ))}
            </div>
          )
        ) : d.sales.length === 0 ? (
          <Empty text="No sales yet." />
        ) : (
          <SalesTable sales={d.sales} names={names} />
        )}
      </div>
      {open && <ItemDialog collection={open.collection} tokenId={open.tokenId} onClose={() => setOpen(null)} onChanged={() => (data.refresh(), mine.refresh())} />}
    </main>
  )
}

function CollectionCard({ c }: { c: NodeNftCollection & { stats: CollectionStats } }) {
  const meta = useMetadata(c.uri)
  return (
    <Link href={`/nfts/${c.collection}`} className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50">
      <NftImage uri={c.uri} name={c.name} rounded="rounded-none" className="transition-transform group-hover:scale-[1.02]" />
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{meta?.name ?? c.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{c.symbol}</span>
        </div>
        <div className="num grid grid-cols-3 gap-1 text-[11px]">
          <Stat k="Floor" v={c.stats.floor ? `${Number(c.stats.floor).toLocaleString('en-US', { maximumFractionDigits: 4 })}` : '—'} />
          <Stat k="Listed" v={String(c.stats.listed)} />
          <Stat k="Items" v={c.supply.toLocaleString()} />
        </div>
        {c.non_transferable && <p className="text-[10px] text-warn">Soulbound: not for sale</p>}
      </div>
    </Link>
  )
}

export function ItemCard({ item, collectionName, onOpen }: { item: NftItem; collectionName: string; onOpen: () => void }) {
  const meta = useMetadata(item.uri)
  const w = useWallet()
  const name = item.name || meta?.name || `#${item.token_id}`
  return (
    <button type="button" onClick={onOpen} className="group overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary/50">
      <NftImage uri={item.uri} name={name} rounded="rounded-none" />
      <div className="p-2.5">
        <div className="truncate text-[11px] text-muted-foreground">{collectionName}</div>
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="num mt-1 flex items-center justify-between text-xs">
          {item.listing ? (
            <span className={cn('font-medium', !item.listing.live && 'text-muted-foreground line-through')} title={item.listing.live ? undefined : 'Stale listing'}>
              {Number(item.listing.priceDisplay).toLocaleString('en-US', { maximumFractionDigits: 6 })} {item.listing.symbol}
            </span>
          ) : (
            <span className="text-muted-foreground">Not listed</span>
          )}
          {w.trader && sameAccount(item.owner, w.trader) && <span className="rounded bg-accent px-1 text-[10px]">yours</span>}
        </div>
      </div>
    </button>
  )
}

export function SalesTable({ sales, names }: { sales: NftSale[]; names?: Map<string, string> }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="num w-full text-xs">
        <thead className="text-[11px] text-muted-foreground">
          <tr className="border-b text-left">
            <th className="px-3 py-2 font-medium">NFT</th>
            <th className="px-3 py-2 text-right font-medium">Price</th>
            <th className="px-3 py-2 font-medium">From</th>
            <th className="px-3 py-2 font-medium">To</th>
            <th className="px-3 py-2 text-right font-medium">Block</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.tx + s.tokenId} className="border-b last:border-b-0">
              <td className="px-3 py-2">
                <Link href={`/nfts/${s.collection}?item=${s.tokenId}`} className="hover:underline">
                  {names?.get(s.collection.toLowerCase()) ?? shortAddr(s.collection)} #{s.tokenId}
                </Link>
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {display(s.price, s.currency.decimals)} {s.currency.symbol}
              </td>
              <td className="px-3 py-2 font-mono">{shortAddr(s.seller)}</td>
              <td className="px-3 py-2 font-mono">{shortAddr(s.buyer)}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1">
                  {s.block.toLocaleString()} <ExplorerLink kind="tx" id={s.tx} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  )
}

export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
      {text}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
