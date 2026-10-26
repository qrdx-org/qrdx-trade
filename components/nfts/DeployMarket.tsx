'use client'

import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MARKET_ARTIFACT } from '@/lib/nft-market'
import { pqGas, waitForReceipt } from '@/lib/nft-client'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'

/**
 * Shown while a network has no live market contract (none configured, or the configured one
 * lost its code to a network reset). On testnet the connected account can deploy
 * contracts/QRDXNFTMarket.sol itself; the site then registers it (POST /nfts/market, which
 * checks its code on chain) and trading opens for everyone, with no redeploy of the site. The
 * contract has no owner and no settings: any deployment of it is as good as another.
 */
export function DeployMarket({ onDeployed }: { onDeployed: () => void }) {
  const { slot, network, apiBase } = useNet()
  const w = useWallet()
  const [state, setState] = useState<{ busy?: string; address?: string; error?: string }>({})
  const [existing, setExisting] = useState('')

  const register = async (address: string) => {
    const res = await fetch(`${apiBase}/nfts/market`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) })
    const body = (await res.json().catch(() => null)) as { market?: string | null; error?: { message: string } } | null
    if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
    return body?.market ?? address
  }

  const deploy = async () => {
    setState({ busy: 'deploy' })
    try {
      const from = w.account?.pqAccountId
      if (!from) throw new Error('Connect the QRDX Wallet first.')
      const gas = await pqGas(network.rpcUrl, { from, to: null, data: MARKET_ARTIFACT.bytecode })
      const hash = await w.sendEvm({ to: null, data: MARKET_ARTIFACT.bytecode, label: 'Deploy the NFT market contract', gas })
      const r = await waitForReceipt(network.rpcUrl, hash, 120_000)
      if (!r.contractAddress) throw new Error('The deployment has no contract address')
      setState({ address: await register(r.contractAddress) })
      onDeployed()
    } catch (e) {
      setState({ error: (e as Error).message })
    }
  }

  const registerExisting = async () => {
    setState({ busy: 'existing' })
    try {
      setState({ address: await register(existing.trim()) })
      onDeployed()
    } catch (e) {
      setState({ error: (e as Error).message })
    }
  }

  return (
    <div className="rounded-xl border border-dashed p-4 text-sm">
      <p className="font-medium">Trading is not open on {network.name} yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Collections and NFTs are listed below, read from the chain. Listing and buying go through the market contract (contracts/QRDXNFTMarket.sol), which this network does
        not have{slot === 'test' ? ' since its reset' : ''}.
      </p>
      {slot === 'test' && !state.address && (
        <div className="mt-3 space-y-3">
          <div>
            <Button size="sm" variant="outline" onClick={deploy} disabled={!!state.busy || !w.trader || !w.rightNetwork}>
              <Rocket className="mr-1.5 h-4 w-4" /> {state.busy === 'deploy' ? 'Deploying…' : 'Deploy the market contract from your account'}
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              One EVM transaction of about 700,000 gas, signed by your quantum-safe account. The contract has no owner or settings; once its code checks out on chain,
              trading opens here for everyone.
            </p>
          </div>
          <div className="flex gap-2">
            <Input value={existing} onChange={(e) => setExisting(e.target.value)} placeholder="Or the address of one already deployed (0x…)" className="h-8 font-mono text-xs" />
            <Button size="sm" variant="outline" className="h-8" disabled={!!state.busy || !/^0x[0-9a-fA-F]{40}$/.test(existing.trim())} onClick={() => void registerExisting()}>
              {state.busy === 'existing' ? 'Checking…' : 'Use it'}
            </Button>
          </div>
        </div>
      )}
      {state.address && (
        <p className="mt-3 rounded-md bg-muted p-2 text-xs">
          The market is <span className="font-mono">{state.address}</span>: trading is open.
        </p>
      )}
      {state.error && <p className="mt-2 text-xs text-ask">{state.error}</p>}
    </div>
  )
}
