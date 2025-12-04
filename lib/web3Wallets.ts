// Direct Web3 wallet integration using browser APIs (Cloudflare-compatible)

export interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on: (event: string, handler: (...args: any[]) => void) => void
  removeListener: (event: string, handler: (...args: any[]) => void) => void
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  isRabby?: boolean
  isWalletConnect?: boolean
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export async function connectMetaMask(): Promise<{ address: string; chainId: number } | null> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    })
    
    const chainId = await window.ethereum.request({
      method: 'eth_chainId',
    })

    return {
      address: accounts[0],
      chainId: parseInt(chainId, 16),
    }
  } catch (error) {
    console.error('Failed to connect MetaMask:', error)
    return null
  }
}

export async function getAccounts(): Promise<string[]> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return []
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts',
    })
    return accounts
  } catch (error) {
    console.error('Failed to get accounts:', error)
    return []
  }
}

export async function getChainId(): Promise<number | null> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null
  }

  try {
    const chainId = await window.ethereum.request({
      method: 'eth_chainId',
    })
    return parseInt(chainId, 16)
  } catch (error) {
    console.error('Failed to get chain ID:', error)
    return null
  }
}

export async function switchChain(chainId: number): Promise<boolean> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return false
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    })
    return true
  } catch (error) {
    console.error('Failed to switch chain:', error)
    return false
  }
}

export function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum?.isMetaMask
}

export function isCoinbaseWalletInstalled(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum?.isCoinbaseWallet
}

export function isRabbyInstalled(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum?.isRabby
}

export function isWalletConnectAvailable(): boolean {
  return typeof window !== 'undefined'
}

export function onAccountsChanged(handler: (accounts: string[]) => void): () => void {
  if (typeof window === 'undefined' || !window.ethereum) {
    return () => {}
  }

  window.ethereum.on('accountsChanged', handler)
  return () => {
    window.ethereum?.removeListener('accountsChanged', handler)
  }
}

export function onChainChanged(handler: (chainId: string) => void): () => void {
  if (typeof window === 'undefined' || !window.ethereum) {
    return () => {}
  }

  window.ethereum.on('chainChanged', handler)
  return () => {
    window.ethereum?.removeListener('chainChanged', handler)
  }
}

export function getWalletName(): string {
  if (typeof window === 'undefined' || !window.ethereum) {
    return 'Unknown'
  }

  if (window.ethereum.isMetaMask) return 'MetaMask'
  if (window.ethereum.isCoinbaseWallet) return 'Coinbase Wallet'
  if (window.ethereum.isRabby) return 'Rabby'
  if (window.ethereum.isWalletConnect) return 'WalletConnect'
  return 'Browser Wallet'
}
