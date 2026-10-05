/**
 * The QRDX Wallet's injected provider (qrdx-wallet docs/DAPP_INTEGRATION.md).
 *
 * Discovery is EIP-6963 (`rdns: org.qrdx.wallet`), which works even when
 * another wallet owns `window.ethereum`; `window.qrdx` is the fallback.
 * Everything else in the site talks to `Eip1193Provider`, so a future popup
 * transport for the web wallet / PWA can replace the injected one.
 */

export interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
  isQRDX?: boolean
}

export interface ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export interface DiscoveredProvider {
  info: ProviderInfo
  provider: Eip1193Provider
}

export const QRDX_RDNS = 'org.qrdx.wallet'

/** Wait briefly for EIP-6963 announcements; fall back to window.qrdx. */
export function discoverQrdxWallet(timeoutMs = 400): Promise<DiscoveredProvider | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    let done = false
    const finish = (p: DiscoveredProvider | null) => {
      if (done) return
      done = true
      window.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener)
      resolve(p)
    }
    const onAnnounce = (e: CustomEvent<DiscoveredProvider>) => {
      if (e.detail?.info?.rdns === QRDX_RDNS) finish(e.detail)
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      const injected = (window as unknown as { qrdx?: Eip1193Provider }).qrdx
      finish(
        injected
          ? { info: { uuid: 'window.qrdx', name: 'QRDX Wallet', icon: '', rdns: QRDX_RDNS }, provider: injected }
          : null
      )
    }, timeoutMs)
  })
}

/** One entry of `qrdx_requestAccounts` / `qrdx_accounts`. */
export interface QrdxAccount {
  address: string
  pqAddress: string
  pqAccountId: string
  pqPublicKey?: string
  pqFingerprint?: string
}

export interface QrdxChainInfo {
  id: string
  name: string
  chainId: number
  isQrdx: boolean
  isTestnet: boolean
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

export interface ProviderError {
  code?: number
  message: string
}

export function providerErrorMessage(err: unknown): string {
  const e = err as ProviderError
  if (e?.code === 4001) return 'Rejected in the wallet.'
  if (e?.code === 4100) return 'The wallet has not connected this site.'
  if (e?.code === 4900) return 'The wallet is unavailable. Reload the page.'
  return e?.message || 'The wallet returned an error.'
}

export const isUserRejection = (err: unknown) => (err as ProviderError)?.code === 4001
