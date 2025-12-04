export interface WalletConnection {
  id: string
  type: 'web3' | 'qrdx'
  address: string
  name: string
  provider?: string
  connected: boolean
}

export interface WalletPair {
  id: string
  name: string
  web3Wallet: WalletConnection | null
  qrdxWallet: WalletConnection | null
}

// Get all web3 wallets from localStorage
export function getWeb3Wallets(): WalletConnection[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('web3Wallets')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Get all QRDX wallets from localStorage
export function getQrdxWallets(): WalletConnection[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('qrdxWallets')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Get all wallet pairs from localStorage
export function getWalletPairs(): WalletPair[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('walletPairs')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Get the selected wallet pair from sessionStorage
export function getSelectedPairId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem('selectedWalletPair')
  } catch {
    return null
  }
}

// Get the selected wallet pair object
export function getSelectedPair(): WalletPair | null {
  const pairId = getSelectedPairId()
  if (!pairId) return null
  
  const pairs = getWalletPairs()
  return pairs.find(p => p.id === pairId) || null
}

// Check if any wallet is connected
export function hasConnectedWallet(): boolean {
  const web3Wallets = getWeb3Wallets()
  const qrdxWallets = getQrdxWallets()
  return web3Wallets.length > 0 || qrdxWallets.length > 0
}

// Get the active wallet address (from selected pair or first available)
export function getActiveWalletAddress(): { type: 'web3' | 'qrdx', address: string } | null {
  // First check if there's a selected pair
  const selectedPair = getSelectedPair()
  if (selectedPair?.web3Wallet) {
    return { type: 'web3', address: selectedPair.web3Wallet.address }
  }
  if (selectedPair?.qrdxWallet) {
    return { type: 'qrdx', address: selectedPair.qrdxWallet.address }
  }
  
  // Fall back to first available wallet
  const web3Wallets = getWeb3Wallets()
  if (web3Wallets.length > 0) {
    return { type: 'web3', address: web3Wallets[0].address }
  }
  
  const qrdxWallets = getQrdxWallets()
  if (qrdxWallets.length > 0) {
    return { type: 'qrdx', address: qrdxWallets[0].address }
  }
  
  return null
}

// Save web3 wallets to localStorage
export function saveWeb3Wallets(wallets: WalletConnection[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('web3Wallets', JSON.stringify(wallets))
    window.dispatchEvent(new Event('storage'))
  } catch (error) {
    console.error('Failed to save web3 wallets:', error)
  }
}

// Save QRDX wallets to localStorage
export function saveQrdxWallets(wallets: WalletConnection[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('qrdxWallets', JSON.stringify(wallets))
    window.dispatchEvent(new Event('storage'))
  } catch (error) {
    console.error('Failed to save QRDX wallets:', error)
  }
}

// Save wallet pairs to localStorage
export function saveWalletPairs(pairs: WalletPair[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('walletPairs', JSON.stringify(pairs))
    window.dispatchEvent(new Event('storage'))
  } catch (error) {
    console.error('Failed to save wallet pairs:', error)
  }
}

// Save selected pair ID to sessionStorage
export function saveSelectedPairId(pairId: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem('selectedWalletPair', pairId)
    window.dispatchEvent(new Event('storage'))
  } catch (error) {
    console.error('Failed to save selected pair:', error)
  }
}

// Clear selected pair from sessionStorage
export function clearSelectedPairId(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem('selectedWalletPair')
    window.dispatchEvent(new Event('storage'))
  } catch (error) {
    console.error('Failed to clear selected pair:', error)
  }
}

// Add a new web3 wallet
export function addWeb3Wallet(wallet: WalletConnection): void {
  const wallets = getWeb3Wallets()
  wallets.push(wallet)
  saveWeb3Wallets(wallets)
}

// Add a new QRDX wallet
export function addQrdxWallet(wallet: WalletConnection): void {
  const wallets = getQrdxWallets()
  wallets.push(wallet)
  saveQrdxWallets(wallets)
}

// Remove a web3 wallet by ID
export function removeWeb3Wallet(id: string): void {
  const wallets = getWeb3Wallets()
  saveWeb3Wallets(wallets.filter(w => w.id !== id))
}

// Remove a QRDX wallet by ID
export function removeQrdxWallet(id: string): void {
  const wallets = getQrdxWallets()
  saveQrdxWallets(wallets.filter(w => w.id !== id))
}

// Add a new wallet pair
export function addWalletPair(pair: WalletPair): void {
  const pairs = getWalletPairs()
  pairs.push(pair)
  saveWalletPairs(pairs)
}

// Update an existing wallet pair
export function updateWalletPair(pairId: string, updates: Partial<WalletPair>): void {
  const pairs = getWalletPairs()
  const updatedPairs = pairs.map(p => p.id === pairId ? { ...p, ...updates } : p)
  saveWalletPairs(updatedPairs)
}

// Remove a wallet pair by ID
export function removeWalletPair(pairId: string): void {
  const pairs = getWalletPairs()
  saveWalletPairs(pairs.filter(p => p.id !== pairId))
  
  // Clear selected pair if it was deleted
  if (getSelectedPairId() === pairId) {
    clearSelectedPairId()
  }
}
