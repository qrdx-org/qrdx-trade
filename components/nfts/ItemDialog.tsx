'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, Loader2, Send, Tag, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ExplorerLink } from '@/components/trade/ExplorerLink'
import { useApi } from '@/lib/hooks/useApi'
import { QRDX_CURRENCY, sameAccount, toBaseUnits } from '@/lib/nft-market'
import type { ApiAsset } from '@/lib/types'
import type { Currency, NftItem } from '@/lib/server/nfts'
import type { NodeNftCollection } from '@/lib/server/node'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'
import { NftImage, shortAddr, useMetadata } from './NftMedia'
import { useNftActions, type Step } from './useNftActions'

interface ItemResponse {
  market: string | null
  collection: NodeNftCollection
  item: NftItem
  history: ({ kind: 'listed' | 'delisted' | 'sold'; block: number; tx: string; price?: string; seller?: string; buyer?: string; currency: Currency | null } & Record<string, unknown>)[]
}

/** One NFT: its image and traits, owner, listing and history; buy it, or list, re-price, cancel or send your own. */
export function ItemDialog({ collection, tokenId, onClose, onChanged }: { collection: string; tokenId: string; onClose: () => void; onChanged: () => void }) {
  const { apiBase } = useNet()
  const w = useWallet()
  const data = useApi<ItemResponse>(`${apiBase}/nfts/${collection}/${tokenId}`, 15_000)
  const d = data.data
  const item = d?.item
  const meta = useMetadata(item?.uri || d?.collection.uri)
  const name = item?.name || meta?.name || `${d?.collection.name ?? 'NFT'} #${tokenId}`
  const mine = !!item && !!w.trader && sameAccount(item.owner, w.trader)
  const actions = useNftActions(d?.market ?? null, () => {
    data.refresh()
    onChanged()
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto p-0">
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <DialogDescription className="sr-only">An NFT in {d?.collection.name ?? 'a collection'}</DialogDescription>
        {!d || !item ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{data.error ? data.error.message : 'Loading…'}</p>
        ) : (
          <div className="grid gap-0 md:grid-cols-2">
            <div className="p-4">
              <NftImage uri={item.uri || d.collection.uri} name={name} />
              {meta?.attributes && meta.attributes.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {meta.attributes.slice(0, 16).map((a, i) => (
                    <div key={i} className="rounded-md border bg-muted/40 px-2 py-1.5 text-[11px]">
                      <div className="truncate text-muted-foreground">{a.trait_type ?? 'trait'}</div>
                      <div className="truncate font-medium">{String(a.value ?? '')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4 border-t p-4 md:border-l md:border-t-0">
              <div>
                <Link href={`/nfts/${d.collection.collection}`} className="text-xs text-muted-foreground hover:underline">
                  {d.collection.name}
                </Link>
                <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
                {meta?.description && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{meta.description}</p>}
              </div>
              <dl className="space-y-1 text-xs">
                <Row k="Owner" v={mine ? 'You' : shortAddr(item.owner)} link={item.owner} />
                <Row k="Token id" v={`#${item.token_id}`} />
                <Row k="Royalty" v={d.collection.royalty_bps ? `${(d.collection.royalty_bps / 100).toFixed(2)} % to the creator` : 'None'} />
                {d.collection.non_transferable && <Row k="Transfers" v="Soulbound: it can never move" />}
              </dl>

              <ListingPanel d={d} item={item} mine={mine} name={name} actions={actions} />
              <Steps steps={actions.steps} />

              {d.history.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold">History</p>
                  <ul className="divide-y rounded-md border text-[11px]">
                    {d.history.slice(0, 12).map((h) => (
                      <li key={`${h.tx}:${h.kind}`} className="flex items-center justify-between gap-2 px-2 py-1.5">
                        <span className="capitalize">{h.kind}</span>
                        <span className="num text-muted-foreground">
                          {h.price && h.currency ? `${display(h.price, h.currency.decimals)} ${h.currency.symbol}` : ''} · block {h.block.toLocaleString()}
                        </span>
                        <ExplorerLink kind="tx" id={h.tx} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ListingPanel({ d, item, mine, name, actions }: { d: ItemResponse; item: NftItem; mine: boolean; name: string; actions: ReturnType<typeof useNftActions> }) {
  const w = useWallet()
  const { apiBase } = useNet()
  const assets = useApi<{ assets: ApiAsset[] }>(`${apiBase}/assets`, 300_000)
  const account = useApi<{ items: (NftItem & { marketApproved: boolean })[] }>(mine && w.trader ? `${apiBase}/nfts/accounts/${w.trader}` : null, 15_000)
  const approved = account.data?.items.find((i) => i.collection === item.collection && i.token_id === item.token_id)?.marketApproved ?? false
  const currencies = useMemo(
    () => [{ address: QRDX_CURRENCY, symbol: 'QRDX', decimals: 18 }, ...(assets.data?.assets ?? []).filter((a) => a.address && a.address !== 'QRDX' && a.listed).map((a) => ({ address: a.address!.toLowerCase(), symbol: a.symbol, decimals: a.decimals }))],
    [assets.data]
  )
  const [cur, setCur] = useState(QRDX_CURRENCY)
  const [price, setPrice] = useState('')
  const [to, setTo] = useState('')
  const [mode, setMode] = useState<'none' | 'list' | 'send'>('none')
  useEffect(() => {
    if (item.listing) setCur(item.listing.currency)
  }, [item.listing])
  const c = currencies.find((x) => x.address === cur) ?? currencies[0]
  const listing = item.listing
  const listingCurrency = listing ? (currencies.find((x) => x.address === listing.currency) ?? { symbol: shortAddr(listing.currency), decimals: 18 }) : null
  let units: bigint | null = null
  let priceError: string | null = null
  try {
    units = price ? toBaseUnits(price, c.decimals) : null
    if (units === 0n) priceError = 'The price must be above zero.'
  } catch (e) {
    priceError = (e as Error).message
  }
  const soulbound = d.collection.non_transferable
  const royalty = d.collection.royalty_bps

  if (!d.market)
    return <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">Listing and buying open once the NFT market contract is deployed on this network.</p>

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {listing ? (
        <div>
          <div className="text-[11px] text-muted-foreground">{listing.live ? 'Price' : 'Stale listing'}</div>
          <div className="num text-2xl font-semibold">
            {listing.priceDisplay} <span className="text-base font-medium">{listingCurrency?.symbol}</span>
          </div>
          {!listing.live && (
            <p className="mt-1 text-[11px] text-warn">
              {sameAccount(item.owner, listing.seller) ? 'The market is no longer approved to move it, so it cannot sell until the owner approves it again.' : 'Its seller no longer owns it, so it cannot sell. Anyone can clear it.'}
            </p>
          )}
          {listing.live && royalty > 0 && <p className="text-[11px] text-muted-foreground">Includes a {(royalty / 100).toFixed(2)} % royalty to the creator.</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{soulbound ? 'Soulbound: it cannot be sold.' : mine ? 'Not listed.' : 'Not for sale.'}</p>
      )}

      {!w.trader ? (
        <p className="text-[11px] text-muted-foreground">Connect the QRDX Wallet to buy or list.</p>
      ) : mine ? (
        <div className="space-y-2">
          {!soulbound && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={mode === 'list' ? 'default' : 'outline'} onClick={() => setMode(mode === 'list' ? 'none' : 'list')} disabled={actions.busy}>
                <Tag className="mr-1 h-3.5 w-3.5" /> {listing ? 'Change price' : 'List for sale'}
              </Button>
              {listing && (
                <Button size="sm" variant="outline" onClick={() => actions.delist({ ...item, name })} disabled={actions.busy}>
                  Cancel listing
                </Button>
              )}
              <Button size="sm" variant={mode === 'send' ? 'default' : 'outline'} onClick={() => setMode(mode === 'send' ? 'none' : 'send')} disabled={actions.busy}>
                <Send className="mr-1 h-3.5 w-3.5" /> Send
              </Button>
            </div>
          )}
          {mode === 'list' && (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Price" className="h-9 tabular" aria-label="Price" />
                <select value={cur} onChange={(e) => setCur(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Currency">
                  {currencies.map((x) => (
                    <option key={x.address} value={x.address}>
                      {x.symbol}
                    </option>
                  ))}
                </select>
              </div>
              {units != null && units > 0n && (
                <p className="text-[11px] text-muted-foreground">
                  You receive {display((units - (units * BigInt(royalty)) / 10_000n).toString(), c.decimals)} {c.symbol}
                  {royalty ? ` after the ${(royalty / 100).toFixed(2)} % royalty` : ''}.{!approved && ' The wallet first asks you to let the market move NFTs of this collection: it can move one only when it sells.'}
                </p>
              )}
              {priceError && <p className="text-[11px] text-ask">{priceError}</p>}
              <Button className="w-full" disabled={!units || !!priceError || actions.busy} onClick={() => units && actions.list({ ...item, name }, c.address, units, approved)}>
                {listing ? 'Update the price' : 'List it'}
              </Button>
            </div>
          )}
          {mode === 'send' && (
            <div className="space-y-1.5">
              <Input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0xPQ… or 0x… recipient" className="h-9 font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">Sending cannot be undone{listing ? ', and it ends the listing' : ''}.</p>
              <Button className="w-full" variant="outline" disabled={!/^0x(PQ[0-9a-fA-F]{64}|[0-9a-fA-F]{40})$/.test(to) || actions.busy} onClick={() => actions.transfer({ ...item, name }, to)}>
                Send {name}
              </Button>
            </div>
          )}
        </div>
      ) : listing?.live ? (
        <Button className="w-full" disabled={actions.busy || !w.rightNetwork} onClick={() => actions.buy({ ...item, name }, listing, listingCurrency?.symbol ?? '')}>
          {actions.busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Buy for {listing.priceDisplay} {listingCurrency?.symbol}
        </Button>
      ) : listing ? (
        <Button className="w-full" variant="outline" disabled={actions.busy} onClick={() => actions.delist({ ...item, name })}>
          Clear the stale listing
        </Button>
      ) : null}
    </div>
  )
}

export function Steps({ steps }: { steps: Step[] }) {
  if (!steps.length) return null
  return (
    <ol className="space-y-1 text-xs" aria-live="polite">
      {steps.map((s) => (
        <li key={s.label} className="flex items-start gap-1.5">
          {s.state === 'done' ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-bid" />
          ) : s.state === 'failed' ? (
            <XCircle className="mt-0.5 h-3.5 w-3.5 text-ask" />
          ) : s.state === 'waiting' ? (
            <Circle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin" />
          )}
          <span className={cn(s.state === 'failed' && 'text-ask')}>
            {s.label}
            {s.state === 'signing' && <span className="text-muted-foreground"> · confirm in the wallet, then a block</span>}
            {s.error && <span className="block">{s.error}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Row({ k, v, link }: { k: string; v: string; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="flex items-center gap-1 font-medium">
        {v}
        {link && <ExplorerLink id={link} />}
      </dd>
    </div>
  )
}

export function display(units: string, decimals: number): string {
  const v = BigInt(units)
  const base = 10n ** BigInt(decimals)
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${(v / base).toLocaleString('en-US')}${frac ? '.' + frac.slice(0, 8) : ''}`
}
