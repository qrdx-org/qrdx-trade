'use client'

import { useState } from 'react'
import { approveCall, buyCall, delistCall, listCall, QRDX_CURRENCY, selector } from '@/lib/nft-market'
import { dryRun, pqGas, waitForExchange, waitForReceipt } from '@/lib/nft-client'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'

export type Step = { label: string; state: 'waiting' | 'signing' | 'pending' | 'done' | 'failed'; error?: string }

/**
 * What a page does with an NFT, step by step: each EVM call is dry-run as the trading account
 * first (a call that would revert says why, instead of costing its fee), signed by the wallet,
 * and waited for. Native operations (approvals, transfers) are exchange transactions.
 */
export function useNftActions(market: string | null, onDone: () => void) {
  const w = useWallet()
  const { network, apiBase } = useNet()
  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)
  const from = w.account?.pqAccountId ?? null

  const run = async (plan: { label: string; go: () => Promise<void> }[]) => {
    setBusy(true)
    const s: Step[] = plan.map((p) => ({ label: p.label, state: 'waiting' }))
    setSteps([...s])
    try {
      for (let i = 0; i < plan.length; i++) {
        s[i] = { ...s[i], state: 'signing' }
        setSteps([...s])
        await plan[i].go()
        s[i] = { ...s[i], state: 'done' }
        setSteps([...s])
      }
      onDone()
    } catch (e) {
      const i = s.findIndex((x) => x.state === 'signing' || x.state === 'pending')
      if (i >= 0) s[i] = { ...s[i], state: 'failed', error: (e as Error).message }
      setSteps([...s])
    } finally {
      setBusy(false)
    }
  }

  const evm = async (to: string, data: string, label: string, value?: bigint) => {
    if (!from) throw new Error('Connect the QRDX Wallet first.')
    await dryRun(network.rpcUrl, { from, to, data, value })
    const gas = await pqGas(network.rpcUrl, { from, to, data, value }).catch(() => undefined)
    const hash = await w.sendEvm({ to, data, value, label, gas })
    await waitForReceipt(network.rpcUrl, hash)
  }

  const exchange = async (op: string, params: Record<string, unknown>, label: string) => {
    const { txHash } = await w.sendExchange({ op, params, label })
    await waitForExchange(apiBase, txHash)
  }

  const needMarket = () => {
    if (!market) throw new Error('The NFT market is not deployed on this network yet.')
    return market
  }

  /** List or re-price: approving the market for the collection first when it may not move the NFT yet. */
  const list = (nft: { collection: string; token_id: string; name: string }, currency: string, price: bigint, approved: boolean) =>
    run([
      ...(approved
        ? []
        : [{ label: 'Let the market move your NFTs in this collection', go: () => exchange('NFT_SET_APPROVAL_FOR_ALL', { collection: nft.collection, operator: needMarket(), approved: true }, `Approve the NFT market for ${nft.name}`) }]),
      { label: 'List it', go: () => evm(needMarket(), listCall(nft.collection, nft.token_id, currency, price), `List ${nft.name}`) },
    ])

  const delist = (nft: { collection: string; token_id: string; name: string }) =>
    run([{ label: 'Cancel the listing', go: () => evm(needMarket(), delistCall(nft.collection, nft.token_id), `Cancel the listing of ${nft.name}`) }])

  /** Buy at the listed terms; for a token price, first allow the market to take that amount. */
  const buy = (nft: { collection: string; token_id: string; name: string }, listing: { currency: string; price: string }, symbol: string) => {
    const price = BigInt(listing.price)
    const native = listing.currency === QRDX_CURRENCY
    return run([
      ...(native
        ? []
        : [
            {
              label: `Allow the market to take ${symbol}`,
              go: async () => {
                if (!from) throw new Error('Connect the QRDX Wallet first.')
                const allowance = await dryRun(network.rpcUrl, {
                  from,
                  to: listing.currency,
                  data: selector('allowance(address,address)') + from.slice(2).padStart(64, '0') + needMarket().slice(2).padStart(64, '0'),
                }).catch(() => '0x0')
                if (BigInt(allowance === '0x' ? '0x0' : allowance) >= price) return
                await evm(listing.currency, approveCall(needMarket(), price), `Allow the NFT market to take ${symbol}`)
              },
            },
          ]),
      { label: 'Buy it', go: () => evm(needMarket(), buyCall(nft.collection, nft.token_id, listing.currency, price), `Buy ${nft.name}`, native ? price : undefined) },
    ])
  }

  const transfer = (nft: { collection: string; token_id: string; name: string }, to: string) =>
    run([{ label: `Send it to ${to.slice(0, 10)}…`, go: () => exchange('NFT_TRANSFER', { collection: nft.collection, token_id: nft.token_id, to }, `Send ${nft.name}`) }])

  return { steps, busy, reset: () => setSteps([]), list, delist, buy, transfer, run, evm, exchange }
}
