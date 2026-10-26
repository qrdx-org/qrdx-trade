'use client'

/**
 * Wallet and network state for the whole site: discovery, connection, the
 * trading account, which network the site is showing, and `sendExchange` for
 * every order, cancel, swap, liquidity action and token launch.
 *
 * Network: the site serves mainnet (/api/v1) and testnet (/api/v1-test). When a
 * connected wallet is on one of them, the site follows the wallet; otherwise it
 * shows the visitor's choice (the nav selector, or ?network=testnet in a link).
 *
 * Trading uses the account's `pqAddress`: every exchange operation is signed by
 * its ML-DSA-65 key (qrdx-node docs/PERPS_API.md §1).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { NetworkConfig, Slot, apiBase as apiBaseFor, slotForChainId, slotNetwork } from '../config'
import {
  DiscoveredProvider,
  QrdxAccount,
  QrdxChainInfo,
  discoverQrdxWallet,
  providerErrorMessage,
} from './provider'
import { addPending } from './pending'
import { agentSend, createAgent, inAgentScope, loadAgent, saveAgent, type StoredAgent } from '../agent'
import { RemoteProvider, RemoteState } from './remote'

export type WalletStatus = 'detecting' | 'missing' | 'disconnected' | 'connecting' | 'connected'
/** How the wallet is reached: the browser extension, or QRDX Connect to another device. */
export type Connection = 'extension' | 'remote'

export interface ExchangeRequest {
  op: string
  params: Record<string, unknown>
  /** Shown in the transactions list. */
  label: string
  market?: string
  gasLimit?: number
}

interface WalletState {
  status: WalletStatus
  /** The provider in use (extension or phone), or the extension when nothing is connected. */
  wallet: DiscoveredProvider | null
  /** The browser extension, when installed. */
  extension: DiscoveredProvider | null
  connection: Connection | null
  /** While pairing a phone: the link the QR code shows. */
  pairing: string | null
  /** The phone connection's transport, when connected through QRDX Connect. */
  phone: RemoteState | null
  accounts: QrdxAccount[]
  account: QrdxAccount | null
  /** The wallet account's own address: what it signs as, and holds its QRDX, stakes and NFTs. */
  trader: string | null
  /**
   * The account the trading screens show and trade: `trader`, or a sub-account or vault of it
   * chosen with `setActingAs` (the wallet signs for it as `signer`).
   */
  tradingAccount: string | null
  actingAs: string | null
  setActingAs: (account: string | null) => void
  /** One-click trading: a key in this browser the wallet approved as an agent (lib/agent.ts). */
  oneClick: StoredAgent | null
  enableOneClick: () => Promise<void>
  disableOneClick: () => Promise<void>
  chain: QrdxChainInfo | null
  /** The wallet is on the network the site is showing. */
  rightNetwork: boolean
  error: string | null
  /** Connect the browser extension. */
  connect: () => Promise<void>
  /** Show a QR code and wait for the QRDX Wallet on a phone to connect. */
  connectPhone: () => Promise<void>
  cancelPairing: () => void
  disconnect: () => Promise<void>
  /** Ask the wallet to move to the network the site is showing. */
  switchNetwork: () => Promise<void>
  /** Returns the nonce the wallet signed with, so dependent operations can follow in the same block. */
  sendExchange: (req: ExchangeRequest) => Promise<{ txHash: string; nonce?: number }>
  /**
   * An EVM transaction from the trading (0xPQ) account: a contract call or a deployment
   * (`to` null), signed as a type-0x51 post-quantum transaction (qrdx_sendPQTransaction).
   * Resolves with its hash once the wallet broadcast it.
   */
  sendEvm: (req: EvmRequest) => Promise<string>
  /**
   * Several exchange operations with one approval (qrdx_sendExchangeBatch): signed with
   * consecutive nonces, so a block applies them in order; each succeeds or fails on its own. A
   * wallet without the method is asked for each in turn.
   */
  sendExchangeBatch: (req: { ops: { op: string; params: Record<string, unknown>; gasLimit?: number }[]; label: string; market?: string }) => Promise<{ txHashes: string[] }>
}

export interface EvmRequest {
  /** The contract; null deploys `data`. */
  to: string | null
  data: string
  /** Wei of QRDX sent with the call. */
  value?: bigint
  /** Gas limit; the wallet estimates one when omitted. */
  gas?: bigint
  /** For the wallet's activity and the page. */
  label: string
}

interface NetState {
  slot: Slot
  network: NetworkConfig
  /** `/api/v1` or `/api/v1-test`. */
  apiBase: string
  /** Show the other network; with a wallet connected, this asks the wallet to switch. */
  setSlot: (slot: Slot) => Promise<void>
}

/**
 * What is sent as the chosen trading account (a sub-account or vault): trading, and moving
 * perps collateral in and out of it. Everything else (staking, launches, NFTs, transfers) is the
 * wallet account's own.
 */
const ACT_AS_OPS = new Set([
  'PLACE_ORDER', 'CANCEL_ORDER', 'MODIFY_ORDER', 'SWAP', 'PERP_SET_LEVERAGE', 'PERP_ORDER', 'PERP_CANCEL',
  'PERP_TRIGGER', 'PERP_MODIFY', 'CANCEL_ALL', 'TWAP_ORDER', 'TWAP_CANCEL', 'PERP_ISOLATED_MARGIN',
  'SCHEDULE_CANCEL', 'PERP_DEPOSIT', 'PERP_WITHDRAW', 'BATCH',
])

const WalletCtx = createContext<WalletState | null>(null)
const NetCtx = createContext<NetState | null>(null)

const REMEMBER = 'qrdx-trade:connected'
const NETWORK_PREF = 'qrdx-trade:network'

/**
 * Accounts as the site uses them. They come from a wallet's reply or from this browser's
 * storage (a phone session's cache), and neither is trusted to have the right shape: one bad
 * entry threw while rendering every page, on every load, until the site's data was cleared.
 */
function asAccounts(value: unknown): QrdxAccount[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (a): a is QrdxAccount => !!a && typeof a === 'object' && typeof (a as QrdxAccount).address === 'string' && typeof (a as QrdxAccount).pqAddress === 'string'
  )
}

function asChain(value: unknown): QrdxChainInfo | null {
  return value && typeof value === 'object' && typeof (value as QrdxChainInfo).chainId === 'number' ? (value as QrdxChainInfo) : null
}

/** Storage access throws in some Safari states (storage blocked, quota): never let it reach a render. */
const linkStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(REMEMBER)
    } catch {
      return null
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(REMEMBER, v)
    } catch {
      /* the link then lasts as long as this page */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(REMEMBER)
    } catch {
      /* nothing stored */
    }
  },
}

function readPreference(): Slot {
  try {
    const q = new URLSearchParams(window.location.search).get('network')
    if (q === 'testnet' || q === 'test') return 'test'
    if (q === 'mainnet' || q === 'main') return 'main'
    return localStorage.getItem(NETWORK_PREF) === 'test' ? 'test' : 'main'
  } catch {
    return 'main'
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('detecting')
  const [extension, setExtension] = useState<DiscoveredProvider | null>(null)
  const [wallet, setWallet] = useState<DiscoveredProvider | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [pairing, setPairing] = useState<string | null>(null)
  const [phone, setPhone] = useState<RemoteState | null>(null)
  const [accounts, setAccounts] = useState<QrdxAccount[]>([])
  const [chain, setChain] = useState<QrdxChainInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preferred, setPreferred] = useState<Slot>('main')
  const walletRef = useRef<DiscoveredProvider | null>(null)
  const extensionRef = useRef<DiscoveredProvider | null>(null)
  const pairingRef = useRef<RemoteProvider | null>(null)

  useEffect(() => setPreferred(readPreference()), [])

  const adopt = useCallback((w: DiscoveredProvider | null, kind: Connection | null) => {
    walletRef.current = w
    setWallet(w)
    setConnection(kind)
  }, [])

  const readState = useCallback(async (w: DiscoveredProvider, request: boolean) => {
    // A phone may be asleep: plain reads give up quickly (the cached state stands);
    // asking to connect waits for the person holding it.
    const remote = (w.provider as RemoteProvider).isRemote === true
    const ask = <T,>(method: string, long = false) =>
      remote
        ? (w.provider as RemoteProvider).request<T>({ method }, long ? undefined : 10_000)
        : w.provider.request<T>({ method })
    const accs = asAccounts(await ask<unknown>(request ? 'qrdx_requestAccounts' : 'qrdx_accounts', request))
    const info = asChain(await ask<unknown>('qrdx_chainInfo').catch(() => null))
    setAccounts(accs)
    if (info) setChain(info)
    setStatus(accs.length ? 'connected' : 'disconnected')
    if (remote) RemoteProvider.remember({ accounts: accs, ...(info ? { chain: info } : {}) })
    else if (accs.length) linkStore.set('extension')
  }, [])

  // Discover the extension, then restore what this browser was connected to.
  useEffect(() => {
    let cancelled = false
    discoverQrdxWallet().then(async (ext) => {
      if (cancelled) return
      extensionRef.current = ext
      setExtension(ext)
      const remembered = linkStore.get()
      const remote = remembered === 'remote' ? RemoteProvider.restore((st) => setPhone(st)) : null
      if (remote) {
        const w = { info: { uuid: 'qrdx-connect', name: 'QRDX Wallet (phone)', icon: '', rdns: 'org.qrdx.connect' }, provider: remote }
        adopt(w, 'remote')
        const cached = RemoteProvider.cached()
        const cachedAccounts = asAccounts(cached.accounts)
        if (cachedAccounts.length) {
          setAccounts(cachedAccounts)
          const cachedChain = asChain(cached.chain)
          if (cachedChain) setChain(cachedChain)
          setStatus('connected')
        } else setStatus('connecting')
        await remote.start().catch(() => undefined)
        readState(w, false).catch(() => undefined)
        return
      }
      adopt(ext, ext ? 'extension' : null)
      if (!ext) return setStatus('missing')
      setStatus('disconnected')
      if (remembered) await readState(ext, false).catch(() => setStatus('disconnected'))
    })
    return () => {
      cancelled = true
    }
  }, [readState, adopt])

  // Follow the wallet: account switches, network switches, disconnects.
  useEffect(() => {
    const p = wallet?.provider
    if (!p?.on) return
    const refresh = () => {
      if (walletRef.current) readState(walletRef.current, false).catch(() => undefined)
    }
    const onDisconnect = () => {
      setAccounts([])
      if ((p as RemoteProvider).isRemote) {
        linkStore.clear()
        setPhone(null)
        adopt(extensionRef.current, extensionRef.current ? 'extension' : null)
        setStatus(extensionRef.current ? 'disconnected' : 'missing')
      } else setStatus('disconnected')
    }
    p.on('accountsChanged', refresh)
    p.on('chainChanged', refresh)
    p.on('disconnect', onDisconnect)
    return () => {
      p.removeListener?.('accountsChanged', refresh)
      p.removeListener?.('chainChanged', refresh)
      p.removeListener?.('disconnect', onDisconnect)
    }
  }, [wallet, readState, adopt])

  // A phone connection reconnects as soon as this tab is visible again.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'visible') (walletRef.current?.provider as RemoteProvider | undefined)?.wake?.()
    }
    document.addEventListener('visibilitychange', wake)
    return () => document.removeEventListener('visibilitychange', wake)
  }, [])

  // The network shown: the wallet's, when it is on one of ours; else the visitor's choice.
  const walletSlot = status === 'connected' ? slotForChainId(chain?.chainId) : null
  const slot: Slot = walletSlot ?? preferred
  const network = slotNetwork(slot)
  useEffect(() => {
    if (walletSlot && walletSlot !== preferred) {
      setPreferred(walletSlot)
      try {
        localStorage.setItem(NETWORK_PREF, walletSlot)
      } catch {
        /* preference is a convenience */
      }
    }
  }, [walletSlot, preferred])

  const connect = useCallback(async () => {
    const w = extensionRef.current
    if (!w) return
    setError(null)
    setStatus('connecting')
    adopt(w, 'extension')
    try {
      await readState(w, true)
    } catch (e) {
      setError(providerErrorMessage(e))
      setStatus('disconnected')
    }
  }, [readState, adopt])

  const connectPhone = useCallback(async () => {
    setError(null)
    pairingRef.current?.disconnect().catch(() => undefined)
    const remote = RemoteProvider.create((st) => setPhone(st))
    pairingRef.current = remote
    try {
      await remote.start()
      setPairing(remote.pairingLink())
      setStatus('connecting')
      const w = { info: { uuid: 'qrdx-connect', name: 'QRDX Wallet (phone)', icon: '', rdns: 'org.qrdx.connect' }, provider: remote }
      // Waits in the relay until the phone scans the code, joins, and approves.
      await readState(w, true)
      if (pairingRef.current !== remote) return
      linkStore.set('remote')
      adopt(w, 'remote')
    } catch (e) {
      if (pairingRef.current !== remote) return
      setError(providerErrorMessage(e))
      await remote.disconnect().catch(() => undefined)
      setPhone(null)
      setStatus(extensionRef.current ? 'disconnected' : 'missing')
    } finally {
      if (pairingRef.current === remote) {
        pairingRef.current = null
        setPairing(null)
      }
    }
  }, [readState, adopt])

  const cancelPairing = useCallback(() => {
    const remote = pairingRef.current
    pairingRef.current = null
    setPairing(null)
    setPhone(null)
    remote?.disconnect().catch(() => undefined)
    setStatus(walletRef.current && accounts.length ? 'connected' : extensionRef.current ? 'disconnected' : 'missing')
  }, [accounts.length])

  const disconnect = useCallback(async () => {
    const w = walletRef.current
    linkStore.clear()
    setAccounts([])
    if ((w?.provider as RemoteProvider | undefined)?.isRemote) {
      await (w!.provider as RemoteProvider).disconnect().catch(() => undefined)
      setPhone(null)
      adopt(extensionRef.current, extensionRef.current ? 'extension' : null)
      setStatus(extensionRef.current ? 'disconnected' : 'missing')
      return
    }
    setStatus(w ? 'disconnected' : 'missing')
    await w?.provider
      .request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
      .catch(() => undefined)
  }, [adopt])

  const switchWalletTo = useCallback(
    async (target: NetworkConfig) => {
      const w = walletRef.current
      if (!w) return
      setError(null)
      try {
        await w.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + target.chainId.toString(16) }],
        })
        await readState(w, false)
      } catch (e) {
        setError(providerErrorMessage(e))
      }
    },
    [readState]
  )

  const switchNetwork = useCallback(() => switchWalletTo(network), [switchWalletTo, network])

  const setSlot = useCallback(
    async (next: Slot) => {
      try {
        localStorage.setItem(NETWORK_PREF, next)
      } catch {
        /* preference is a convenience */
      }
      if (status === 'connected') await switchWalletTo(slotNetwork(next))
      setPreferred(next)
    },
    [status, switchWalletTo]
  )

  const account = accounts[0] ?? null
  const trader = account?.pqAddress ?? null
  const rightNetwork = !!chain && chain.chainId === network.chainId

  // The account the trading screens act for (a sub-account or a vault the trader leads).
  const actKey = trader ? `qrdx-trade:acting:${slot}:${trader.toLowerCase()}` : null
  const [actingAs, setActingState] = useState<string | null>(null)
  useEffect(() => {
    let v: string | null = null
    try {
      v = actKey ? localStorage.getItem(actKey) : null
    } catch {
      /* none remembered */
    }
    setActingState(v && /^0x(SUBA|UVLT)[0-9a-fA-F]{36}$/.test(v) ? v : null)
  }, [actKey])
  const setActingAs = useCallback(
    (a: string | null) => {
      setActingState(a)
      try {
        if (actKey && a) localStorage.setItem(actKey, a)
        else if (actKey) localStorage.removeItem(actKey)
      } catch {
        /* for this page only */
      }
    },
    [actKey]
  )
  const tradingAccount = actingAs ?? trader

  // One-click trading's key for this account on this network.
  const [oneClick, setOneClick] = useState<StoredAgent | null>(null)
  useEffect(() => {
    setOneClick(trader ? loadAgent(slot, trader) : null)
  }, [trader, slot])
  const oneClickLive = (a: StoredAgent | null): a is StoredAgent => !!a && a.approved && a.validUntil > Date.now() / 1000 + 60

  const sendExchange = useCallback(
    async (req: ExchangeRequest) => {
      const w = walletRef.current
      if (!w || !trader) throw new Error('Connect the QRDX Wallet first.')
      if (!rightNetwork) throw new Error(`Switch the wallet to ${network.name}.`)
      const sender = actingAs && ACT_AS_OPS.has(req.op) ? actingAs : undefined
      // One-click trading signs what an agent may sign, here, without a wallet prompt.
      if (oneClickLive(oneClick) && inAgentScope(req.op, req.params)) {
        const res = await agentSend({ rpcUrl: network.rpcUrl, chainId: network.chainId, agent: oneClick, sender: sender ?? trader, op: req.op, params: req.params, gasLimit: req.gasLimit })
        addPending(trader, slot, { txHash: res.txHash, op: req.op, label: req.label, market: req.market })
        return res
      }
      try {
        const res = await w.provider.request<{ txHash: string; nonce?: number }>({
          method: 'qrdx_sendExchangeTransaction',
          params: [{ op: req.op, params: req.params, gasLimit: req.gasLimit, from: account?.address, ...(sender ? { sender } : {}) }],
        })
        addPending(trader, slot, { txHash: res.txHash, op: req.op, label: req.label, market: req.market })
        return res
      } catch (e) {
        throw new Error(providerErrorMessage(e))
      }
    },
    [trader, account, rightNetwork, network, slot, actingAs, oneClick]
  )

  const enableOneClick = useCallback(async () => {
    if (!trader) throw new Error('Connect the QRDX Wallet first.')
    const { stored } = createAgent()
    // Kept before the wallet approves it, so a reload in between does not lose the key.
    saveAgent(slot, trader, stored)
    setOneClick(stored)
    try {
      await sendExchange({
        op: 'AGENT_APPROVE',
        params: { agent: stored.address, valid_until: stored.validUntil, name: 'QRDX Trade one-click' },
        label: 'Turn on one-click trading',
      })
    } catch (e) {
      saveAgent(slot, trader, null)
      setOneClick(null)
      throw e
    }
    // Live once a block has applied the approval.
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const agents = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'exchange_getAgents', params: [trader] }),
      })
        .then((r) => r.json())
        .then((b: { result?: { agent: string }[] }) => b.result ?? [])
        .catch(() => [])
      if (agents.some((a) => a.agent.toLowerCase() === stored.address.toLowerCase())) {
        const live = { ...stored, approved: true }
        saveAgent(slot, trader, live)
        setOneClick(live)
        return
      }
    }
    throw new Error('The approval has not reached a block yet; one-click trading turns on when it does.')
  }, [trader, slot, network.rpcUrl, sendExchange])

  const disableOneClick = useCallback(async () => {
    if (!trader || !oneClick) return
    const agent = oneClick
    saveAgent(slot, trader, null)
    setOneClick(null)
    // The agent gives up its own approval on chain (no wallet prompt); an expired one has lapsed already.
    if (oneClickLive(agent)) {
      const res = await agentSend({ rpcUrl: network.rpcUrl, chainId: network.chainId, agent, sender: trader, op: 'AGENT_REVOKE', params: { agent: agent.address } }).catch(() => null)
      if (res) addPending(trader, slot, { txHash: res.txHash, op: 'AGENT_REVOKE', label: 'Turn off one-click trading' })
    }
  }, [trader, slot, network, oneClick])

  const sendEvm = useCallback(
    async (req: EvmRequest) => {
      const w = walletRef.current
      if (!w || !trader) throw new Error('Connect the QRDX Wallet first.')
      if (!rightNetwork) throw new Error(`Switch the wallet to ${network.name}.`)
      try {
        return await w.provider.request<string>({
          method: 'qrdx_sendPQTransaction',
          params: [
            {
              from: account?.address,
              ...(req.to ? { to: req.to } : {}),
              data: req.data,
              value: '0x' + (req.value ?? 0n).toString(16),
              ...(req.gas ? { gas: '0x' + req.gas.toString(16) } : {}),
            },
          ],
        })
      } catch (e) {
        throw new Error(providerErrorMessage(e))
      }
    },
    [trader, account, rightNetwork, network.name]
  )

  const sendExchangeBatch = useCallback(
    async (req: { ops: { op: string; params: Record<string, unknown>; gasLimit?: number }[]; label: string; market?: string }) => {
      const w = walletRef.current
      if (!w || !trader) throw new Error('Connect the QRDX Wallet first.')
      if (!rightNetwork) throw new Error(`Switch the wallet to ${network.name}.`)
      const sender = actingAs && req.ops.every((o) => ACT_AS_OPS.has(o.op)) ? actingAs : undefined
      if (actingAs && !sender) throw new Error('Switch the trading account back to your own for this.')
      const batch = { actions: req.ops.map((o) => ({ op: o.op, params: o.params })) }
      if (oneClickLive(oneClick) && req.ops.length <= 20 && inAgentScope('BATCH', batch)) {
        const gasLimit = Math.min(10_000 + req.ops.reduce((n, o) => n + (o.gasLimit ?? 1_000_000), 0), 20_000_000)
        const r = await agentSend({ rpcUrl: network.rpcUrl, chainId: network.chainId, agent: oneClick, sender: sender ?? trader, op: 'BATCH', params: batch, gasLimit })
        addPending(trader, slot, { txHash: r.txHash, op: 'BATCH', label: req.label, market: req.market })
        return { txHashes: [r.txHash] }
      }
      let res: { txHashes: string[] }
      try {
        res = await w.provider.request<{ txHashes: string[] }>({
          method: 'qrdx_sendExchangeBatch',
          params: [{ ops: req.ops, label: req.label, from: account?.address, ...(sender ? { sender } : {}) }],
        })
      } catch (e) {
        // Older wallets: one approval per operation, in order.
        if ((e as { code?: number }).code !== 4200 && !/does not support|not supported|unknown method/i.test(String((e as Error)?.message))) throw new Error(providerErrorMessage(e))
        const txHashes: string[] = []
        for (const [i, o] of req.ops.entries()) {
          const r = await w.provider
            .request<{ txHash: string; nonce?: number }>({ method: 'qrdx_sendExchangeTransaction', params: [{ op: o.op, params: o.params, gasLimit: o.gasLimit, from: account?.address, ...(sender ? { sender } : {}) }] })
            .catch((err) => {
              throw new Error(i ? `Steps 1–${i} were sent; step ${i + 1} failed: ${providerErrorMessage(err)}` : providerErrorMessage(err))
            })
          txHashes.push(r.txHash)
        }
        res = { txHashes }
      }
      // A wallet on a node with BATCH sends the operations as one transaction, all or nothing.
      if (res.txHashes.length === 1 && req.ops.length > 1) addPending(trader, slot, { txHash: res.txHashes[0], op: 'BATCH', label: req.label, market: req.market })
      else res.txHashes.forEach((txHash, i) => addPending(trader, slot, { txHash, op: req.ops[i]?.op ?? 'SWAP', label: `${req.label} (${i + 1} of ${req.ops.length})`, market: req.market }))
      return res
    },
    [trader, account, rightNetwork, network, slot, actingAs, oneClick]
  )

  const walletValue = useMemo<WalletState>(
    () => ({
      status,
      wallet,
      extension,
      connection,
      pairing,
      phone,
      accounts,
      account,
      trader,
      tradingAccount,
      actingAs,
      setActingAs,
      oneClick,
      enableOneClick,
      disableOneClick,
      chain,
      rightNetwork,
      error,
      connect,
      connectPhone,
      cancelPairing,
      disconnect,
      switchNetwork,
      sendExchange,
      sendEvm,
      sendExchangeBatch,
    }),
    [status, wallet, extension, connection, pairing, phone, accounts, account, trader, tradingAccount, actingAs, setActingAs, oneClick, enableOneClick, disableOneClick, chain, rightNetwork, error, connect, connectPhone, cancelPairing, disconnect, switchNetwork, sendExchange, sendEvm, sendExchangeBatch]
  )
  const netValue = useMemo<NetState>(
    () => ({ slot, network, apiBase: apiBaseFor(slot), setSlot }),
    [slot, network, setSlot]
  )
  return (
    <NetCtx.Provider value={netValue}>
      <WalletCtx.Provider value={walletValue}>{children}</WalletCtx.Provider>
    </NetCtx.Provider>
  )
}

export function useWallet(): WalletState {
  const v = useContext(WalletCtx)
  if (!v) throw new Error('useWallet outside WalletProvider')
  return v
}

/** The network the site is showing and its API base. */
export function useNet(): NetState {
  const v = useContext(NetCtx)
  if (!v) throw new Error('useNet outside WalletProvider')
  return v
}
