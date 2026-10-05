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
  /** The address exchange state is keyed by. */
  trader: string | null
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
}

interface NetState {
  slot: Slot
  network: NetworkConfig
  /** `/api/v1` or `/api/v1-test`. */
  apiBase: string
  /** Show the other network; with a wallet connected, this asks the wallet to switch. */
  setSlot: (slot: Slot) => Promise<void>
}

const WalletCtx = createContext<WalletState | null>(null)
const NetCtx = createContext<NetState | null>(null)

const REMEMBER = 'qrdx-trade:connected'
const NETWORK_PREF = 'qrdx-trade:network'

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

  const use = useCallback((w: DiscoveredProvider | null, kind: Connection | null) => {
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
    const accs = await ask<QrdxAccount[]>(request ? 'qrdx_requestAccounts' : 'qrdx_accounts', request)
    const info = await ask<QrdxChainInfo>('qrdx_chainInfo').catch(() => null)
    setAccounts(accs ?? [])
    if (info) setChain(info)
    setStatus(accs?.length ? 'connected' : 'disconnected')
    if (remote) RemoteProvider.remember({ accounts: accs, ...(info ? { chain: info } : {}) })
    else if (accs?.length) localStorage.setItem(REMEMBER, 'extension')
  }, [])

  // Discover the extension, then restore what this browser was connected to.
  useEffect(() => {
    let cancelled = false
    discoverQrdxWallet().then(async (ext) => {
      if (cancelled) return
      extensionRef.current = ext
      setExtension(ext)
      const remembered = localStorage.getItem(REMEMBER)
      const remote = remembered === 'remote' ? RemoteProvider.restore((st) => setPhone(st)) : null
      if (remote) {
        const w = { info: { uuid: 'qrdx-connect', name: 'QRDX Wallet (phone)', icon: '', rdns: 'org.qrdx.connect' }, provider: remote }
        use(w, 'remote')
        const cached = RemoteProvider.cached()
        if (Array.isArray(cached.accounts) && cached.accounts.length) {
          setAccounts(cached.accounts as QrdxAccount[])
          if (cached.chain) setChain(cached.chain as QrdxChainInfo)
          setStatus('connected')
        } else setStatus('connecting')
        await remote.start().catch(() => undefined)
        readState(w, false).catch(() => undefined)
        return
      }
      use(ext, ext ? 'extension' : null)
      if (!ext) return setStatus('missing')
      setStatus('disconnected')
      if (remembered) await readState(ext, false).catch(() => setStatus('disconnected'))
    })
    return () => {
      cancelled = true
    }
  }, [readState, use])

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
        localStorage.removeItem(REMEMBER)
        setPhone(null)
        use(extensionRef.current, extensionRef.current ? 'extension' : null)
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
  }, [wallet, readState, use])

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
    use(w, 'extension')
    try {
      await readState(w, true)
    } catch (e) {
      setError(providerErrorMessage(e))
      setStatus('disconnected')
    }
  }, [readState, use])

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
      localStorage.setItem(REMEMBER, 'remote')
      use(w, 'remote')
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
  }, [readState, use])

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
    localStorage.removeItem(REMEMBER)
    setAccounts([])
    if ((w?.provider as RemoteProvider | undefined)?.isRemote) {
      await (w!.provider as RemoteProvider).disconnect().catch(() => undefined)
      setPhone(null)
      use(extensionRef.current, extensionRef.current ? 'extension' : null)
      setStatus(extensionRef.current ? 'disconnected' : 'missing')
      return
    }
    setStatus(w ? 'disconnected' : 'missing')
    await w?.provider
      .request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
      .catch(() => undefined)
  }, [use])

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

  const sendExchange = useCallback(
    async (req: ExchangeRequest) => {
      const w = walletRef.current
      if (!w || !trader) throw new Error('Connect the QRDX Wallet first.')
      if (!rightNetwork) throw new Error(`Switch the wallet to ${network.name}.`)
      try {
        const res = await w.provider.request<{ txHash: string; nonce?: number }>({
          method: 'qrdx_sendExchangeTransaction',
          params: [{ op: req.op, params: req.params, gasLimit: req.gasLimit, from: account?.address }],
        })
        addPending(trader, slot, { txHash: res.txHash, op: req.op, label: req.label, market: req.market })
        return res
      } catch (e) {
        throw new Error(providerErrorMessage(e))
      }
    },
    [trader, account, rightNetwork, network.name, slot]
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
      chain,
      rightNetwork,
      error,
      connect,
      connectPhone,
      cancelPairing,
      disconnect,
      switchNetwork,
      sendExchange,
    }),
    [status, wallet, extension, connection, pairing, phone, accounts, account, trader, chain, rightNetwork, error, connect, connectPhone, cancelPairing, disconnect, switchNetwork, sendExchange]
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
