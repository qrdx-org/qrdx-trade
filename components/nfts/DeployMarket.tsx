'use client'

import { useState } from 'react'
import { Copy, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MARKET_ARTIFACT } from '@/lib/nft-market'
import { pqGas, waitForReceipt } from '@/lib/nft-client'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'

/**
 * Shown while a network has no market contract configured. On testnet the connected account
 * can deploy contracts/QRDXNFTMarket.sol itself; the site then needs its address in
 * NEXT_PUBLIC_QRDX_TEST_NFT_MARKET (the contract has no owner and no settings: any deployment
 * of it is as good as another).
 */
export function DeployMarket({ onDeployed }: { onDeployed: () => void }) {
  const { slot, network } = useNet()
  const w = useWallet()
  const [state, setState] = useState<{ busy?: boolean; address?: string; error?: string }>({})
  const variable = slot === 'main' ? 'NEXT_PUBLIC_QRDX_MAIN_NFT_MARKET' : 'NEXT_PUBLIC_QRDX_TEST_NFT_MARKET'

  const deploy = async () => {
    setState({ busy: true })
    try {
      const from = w.account?.pqAccountId
      if (!from) throw new Error('Connect the QRDX Wallet first.')
      const gas = await pqGas(network.rpcUrl, { from, to: null, data: MARKET_ARTIFACT.bytecode })
      const hash = await w.sendEvm({ to: null, data: MARKET_ARTIFACT.bytecode, label: 'Deploy the NFT market contract', gas })
      const r = await waitForReceipt(network.rpcUrl, hash, 120_000)
      if (!r.contractAddress) throw new Error('The deployment has no contract address')
      setState({ address: r.contractAddress })
      onDeployed()
    } catch (e) {
      setState({ error: (e as Error).message })
    }
  }

  return (
    <div className="rounded-xl border border-dashed p-4 text-sm">
      <p className="font-medium">Trading is not open on {network.name} yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Collections and NFTs are listed below, read from the chain. Listing and buying go through the market contract (contracts/QRDXNFTMarket.sol), which is not
        configured for this network.
      </p>
      {slot === 'test' && !state.address && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={deploy} disabled={state.busy || !w.trader || !w.rightNetwork}>
            <Rocket className="mr-1.5 h-4 w-4" /> {state.busy ? 'Deploying…' : 'Deploy the market contract from your account'}
          </Button>
          <p className="mt-1 text-[11px] text-muted-foreground">One EVM transaction of about 700,000 gas, signed by your quantum-safe account. The contract has no owner or settings.</p>
        </div>
      )}
      {state.address && (
        <div className="mt-3 rounded-md bg-muted p-2 text-xs">
          Deployed at <span className="font-mono">{state.address}</span>.{' '}
          <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => navigator.clipboard?.writeText(`${variable}=${state.address}`)}>
            <Copy className="h-3 w-3" /> Copy {variable}={state.address.slice(0, 10)}…
          </button>{' '}
          Set it for the site and redeploy to open trading.
        </div>
      )}
      {state.error && <p className="mt-2 text-xs text-ask">{state.error}</p>}
    </div>
  )
}
