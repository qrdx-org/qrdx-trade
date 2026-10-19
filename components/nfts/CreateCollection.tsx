'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TradeGate } from '@/components/trade/TradeGate'
import { waitForExchange } from '@/lib/nft-client'
import type { NodeNftCollection } from '@/lib/server/node'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { Steps } from './ItemDialog'
import { NftImage } from './NftMedia'
import type { Step } from './useNftActions'

const ADDRESS = /^0x(PQ[0-9a-fA-F]{64}|[0-9a-fA-F]{40})$/
const URI_HINT = 'A JSON document in the common NFT format (name, description, image, attributes), at https://, ipfs:// or ar://. At most 256 characters.'

/**
 * Create a native NFT collection (NFT_CREATE_COLLECTION): its name, symbol and metadata, an
 * optional supply cap, a royalty for marketplaces (ERC-2981), and whether it is soulbound.
 * You hold its mint and update authorities. Then mint into it on its page.
 */
export function CreateCollection() {
  const w = useWallet()
  const router = useRouter()
  const { apiBase, network } = useNet()
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [uri, setUri] = useState('')
  const [maxSupply, setMaxSupply] = useState('')
  const [royalty, setRoyalty] = useState('5')
  const [soulbound, setSoulbound] = useState(false)
  const [lockMetadata, setLockMetadata] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)

  const bps = Math.round(Number(royalty || 0) * 100)
  const problem =
    !name.trim() || name.trim().length > 64
      ? 'Name it (1–64 characters)'
      : !symbol.trim() || symbol.length > 16 || /[\s:]/.test(symbol)
        ? 'A symbol of 1–16 characters, no spaces'
        : uri.length > 256
          ? 'The metadata URI is too long'
          : maxSupply && !/^[1-9]\d*$/.test(maxSupply)
            ? 'The max supply is a whole number'
            : !Number.isFinite(bps) || bps < 0 || bps > 10_000
              ? 'The royalty is 0–100 %'
              : null

  const create = async () => {
    if (problem) return
    setBusy(true)
    const s: Step[] = [{ label: `Create ${name.trim()}`, state: 'signing' }]
    setSteps([...s])
    try {
      const params: Record<string, unknown> = { name: name.trim(), symbol: symbol.trim(), uri: uri.trim(), royalty_bps: bps }
      if (maxSupply) params.max_supply = Number(maxSupply)
      if (soulbound) params.non_transferable = true
      if (lockMetadata) params.update_authority = ''
      const { txHash } = await w.sendExchange({ op: 'NFT_CREATE_COLLECTION', params, label: `Create NFT collection ${name.trim()}` })
      const data = await waitForExchange(apiBase, txHash)
      s[0] = { ...s[0], state: 'done' }
      setSteps([...s])
      router.push(`/nfts/${String(data.collection)}`)
    } catch (e) {
      s[0] = { ...s[0], state: 'failed', error: (e as Error).message }
      setSteps([...s])
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/nfts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> NFT market
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Create a collection</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A native collection on {network.name}: no contract to deploy. Every NFT minted into it is verified as part of it, because only its mint authority (you) can mint.
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_180px]">
        <TradeGate action="create a collection">
          <div className="space-y-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Quantum Art" />
            </Field>
            <Field label="Symbol">
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/\s/g, '').toUpperCase())} maxLength={16} placeholder="QART" />
            </Field>
            <Field label="Collection metadata URI" hint={URI_HINT}>
              <Input value={uri} onChange={(e) => setUri(e.target.value.trim())} maxLength={256} placeholder="ipfs://…/collection.json" className="font-mono text-xs" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max supply" hint="Empty for no cap.">
                <Input value={maxSupply} onChange={(e) => setMaxSupply(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="unlimited" className="tabular" />
              </Field>
              <Field label="Royalty (%)" hint="Paid to you on every sale through the market.">
                <Input value={royalty} onChange={(e) => setRoyalty(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="tabular" />
              </Field>
            </div>
            {bps > 1000 && <p className="text-[11px] text-warn">Royalties above 10 % make buyers think twice.</p>}
            <label className="flex cursor-pointer gap-2 text-xs">
              <input type="checkbox" checked={soulbound} onChange={(e) => setSoulbound(e.target.checked)} className="mt-0.5" />
              <span>
                <b>Soulbound</b>
                <span className="block text-muted-foreground">NFTs can never be transferred or sold: badges, memberships, credentials.</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-2 text-xs">
              <input type="checkbox" checked={lockMetadata} onChange={(e) => setLockMetadata(e.target.checked)} className="mt-0.5" />
              <span>
                <b>Freeze the metadata</b>
                <span className="block text-muted-foreground">Nobody can ever change the collection&apos;s or its NFTs&apos; names and URIs. Otherwise you can.</span>
              </span>
            </label>
            <Button className="w-full" disabled={!!problem || busy || !w.rightNetwork} onClick={create}>
              {busy ? 'Confirm in wallet…' : problem ?? `Create ${name.trim()}`}
            </Button>
            <Steps steps={steps} />
          </div>
        </TradeGate>
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">Preview</p>
          <NftImage uri={uri} name={name || 'New'} />
          <p className="mt-1 truncate text-sm font-medium">{name || 'Collection name'}</p>
        </div>
      </div>
    </main>
  )
}

/** Mint into a collection you are the mint authority of (NFT_MINT). */
export function MintPanel({ collection, onMinted }: { collection: NodeNftCollection; onMinted: () => void }) {
  const w = useWallet()
  const { apiBase } = useNet()
  const [uri, setUri] = useState('')
  const [name, setName] = useState('')
  const [to, setTo] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)
  const full = collection.max_supply != null && collection.supply >= collection.max_supply
  const problem = full ? 'The collection is at its max supply' : to && !ADDRESS.test(to) ? 'The recipient must be a 0x… or 0xPQ… address' : uri.length > 256 ? 'The URI is too long' : tokenId && !/^\d+$/.test(tokenId) ? 'The token id is a whole number' : null

  const mint = async () => {
    setBusy(true)
    const s: Step[] = [{ label: `Mint ${name || 'an NFT'}`, state: 'signing' }]
    setSteps([...s])
    try {
      const params: Record<string, unknown> = { collection: collection.collection }
      if (uri) params.uri = uri
      if (name) params.name = name
      if (to) params.to = to
      if (tokenId) params.token_id = tokenId
      const { txHash } = await w.sendExchange({ op: 'NFT_MINT', params, label: `Mint ${name || 'an NFT'} in ${collection.name}` })
      const data = await waitForExchange(apiBase, txHash)
      s[0] = { ...s[0], label: `Minted #${String(data.token_id ?? '')}`, state: 'done' }
      setSteps([...s])
      setUri('')
      setName('')
      setTokenId('')
      onMinted()
    } catch (e) {
      s[0] = { ...s[0], state: 'failed', error: (e as Error).message }
      setSteps([...s])
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
        <ImagePlus className="h-4 w-4" /> Mint into {collection.name}
        <span className="text-xs font-normal text-muted-foreground">you are its mint authority</span>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Metadata URI" hint="The NFT's JSON (name, description, image, attributes).">
          <Input value={uri} onChange={(e) => setUri(e.target.value.trim())} maxLength={256} placeholder="ipfs://…/1.json" className="font-mono text-xs" />
        </Field>
        <Field label="Name" hint="Optional; the metadata's name is shown otherwise.">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={`${collection.name} #${collection.minted + 1}`} />
        </Field>
        <Field label="To" hint="Empty mints to you.">
          <Input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0xPQ… or 0x…" className="font-mono text-xs" />
        </Field>
        <Field label="Token id" hint="Empty takes the next number.">
          <Input value={tokenId} onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={String(collection.minted + 1)} className="tabular" />
        </Field>
      </div>
      <Button className="mt-3" size="sm" disabled={!!problem || busy || !w.rightNetwork} onClick={mint}>
        {busy ? 'Confirm in wallet…' : problem ?? 'Mint'}
      </Button>
      <div className="mt-2">
        <Steps steps={steps} />
      </div>
    </details>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium">{label}</div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
