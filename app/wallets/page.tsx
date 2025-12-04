'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Shield, Plus, Trash2, CheckCircle2, Link2, ExternalLink, QrCode } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount, useDisconnect } from 'wagmi'
import {
  connectMetaMask,
  isMetaMaskInstalled,
  isWalletConnectAvailable,
  getWalletName,
  onAccountsChanged,
  onChainChanged
} from '@/lib/web3Wallets'
import {
  WalletConnection,
  WalletPair,
  getWeb3Wallets,
  getQrdxWallets,
  getWalletPairs,
  getSelectedPairId,
  saveWeb3Wallets,
  saveQrdxWallets,
  saveWalletPairs,
  saveSelectedPairId,
  clearSelectedPairId,
  addWeb3Wallet,
  addQrdxWallet,
  removeWeb3Wallet,
  removeQrdxWallet,
  addWalletPair,
  updateWalletPair,
  removeWalletPair
} from '@/lib/walletStore'

export default function WalletsPage() {
  const [web3Wallets, setWeb3Wallets] = useState<WalletConnection[]>([])
  const [qrdxWallets, setQrdxWallets] = useState<WalletConnection[]>([])
  const [walletPairs, setWalletPairs] = useState<WalletPair[]>([])
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null)
  const [showConnectModal, setShowConnectModal] = useState<'web3' | 'qrdx' | null>(null)
  
  // WalletConnect hooks
  const { open } = useWeb3Modal()
  const { address: wcAddress, isConnected: wcIsConnected } = useAccount()
  const { disconnect: wcDisconnect } = useDisconnect()

  // Define available Web3 wallet connectors
  const connectors = [
    {
      id: 'walletconnect',
      name: 'WalletConnect',
      icon: <QrCode className="h-5 w-5" />,
      description: 'Scan with Uniswap, Rainbow, Trust & 300+ wallets',
      ready: isWalletConnectAvailable()
    },
    {
      id: 'metamask',
      name: 'MetaMask',
      icon: <Wallet className="h-5 w-5" />,
      description: 'Browser extension wallet',
      ready: isMetaMaskInstalled()
    },
    {
      id: 'browser',
      name: 'Browser Wallet',
      icon: <Wallet className="h-5 w-5" />,
      description: 'Any injected Ethereum wallet',
      ready: typeof window !== 'undefined' && !!window.ethereum
    }
  ]
  
  // Sync WalletConnect state
  useEffect(() => {
    if (wcIsConnected && wcAddress) {
      const existingWallet = web3Wallets.find(w => w.address.toLowerCase() === wcAddress.toLowerCase())
      if (!existingWallet) {
        const newWallet: WalletConnection = {
          id: Date.now().toString(),
          type: 'web3',
          address: wcAddress,
          name: 'WalletConnect',
          provider: 'WalletConnect',
          connected: true
        }
        const updated = [...web3Wallets, newWallet]
        setWeb3Wallets(updated)
        saveWeb3Wallets(updated)
      }
    }
  }, [wcIsConnected, wcAddress])

  // Load state from storage on mount
  useEffect(() => {
    setWeb3Wallets(getWeb3Wallets())
    setQrdxWallets(getQrdxWallets())
    setWalletPairs(getWalletPairs())
    setSelectedPairId(getSelectedPairId())
  }, [])

  // Listen for account/chain changes
  useEffect(() => {
    const unsubAccounts = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        // Wallet disconnected
        const updated = web3Wallets.map(w => ({ ...w, connected: false }))
        setWeb3Wallets(updated)
        saveWeb3Wallets(updated)
      }
    })

    const unsubChain = onChainChanged(() => {
      // Chain changed - could update chain info if needed
    })

    return () => {
      unsubAccounts()
      unsubChain()
    }
  }, [web3Wallets])

  const handleConnectWeb3 = async (connectorId?: string) => {
    // Handle WalletConnect separately
    if (connectorId === 'walletconnect') {
      await open()
      setShowConnectModal(null)
      return
    }
    
    // Handle MetaMask and other browser wallets
    const result = await connectMetaMask()
    if (result) {
      const walletName = getWalletName()
      const existingWallet = web3Wallets.find(w => w.address.toLowerCase() === result.address.toLowerCase())
      
      if (!existingWallet) {
        const newWallet: WalletConnection = {
          id: Date.now().toString(),
          type: 'web3',
          address: result.address,
          name: walletName,
          provider: walletName,
          connected: true
        }
        const updated = [...web3Wallets, newWallet]
        setWeb3Wallets(updated)
        saveWeb3Wallets(updated)
      }
      setShowConnectModal(null)
    }
  }

  const handleConnectQRDX = (name: string) => {
    // Mock QRDX wallet connection
    const newWallet: WalletConnection = {
      id: Date.now().toString(),
      type: 'qrdx',
      address: `qrdx1${Math.random().toString(36).substr(2, 39)}`,
      name: name || 'QRDX Wallet',
      connected: true
    }
    const updated = [...qrdxWallets, newWallet]
    setQrdxWallets(updated)
    saveQrdxWallets(updated)
    setShowConnectModal(null)
  }

  const handleDisconnect = (id: string, type: 'web3' | 'qrdx') => {
    if (type === 'web3') {
      const wallet = web3Wallets.find(w => w.id === id)
      
      // Disconnect WalletConnect if it's a WalletConnect wallet
      if (wallet?.provider === 'WalletConnect' && wcIsConnected) {
        wcDisconnect()
      }
      
      const updated = web3Wallets.filter(w => w.id !== id)
      setWeb3Wallets(updated)
      saveWeb3Wallets(updated)
    } else {
      const updated = qrdxWallets.filter(w => w.id !== id)
      setQrdxWallets(updated)
      saveQrdxWallets(updated)
    }
  }

  const handleCreatePair = () => {
    const newPair: WalletPair = {
      id: Date.now().toString(),
      name: `Pair ${walletPairs.length + 1}`,
      web3Wallet: null,
      qrdxWallet: null
    }
    const updatedPairs = [...walletPairs, newPair]
    setWalletPairs(updatedPairs)
    saveWalletPairs(updatedPairs)
  }

  const handleUpdatePair = (pairId: string, type: 'web3' | 'qrdx', walletId: string | null) => {
    const updatedPairs = walletPairs.map(pair => {
      if (pair.id === pairId) {
        if (type === 'web3') {
          return { ...pair, web3Wallet: web3Wallets.find(w => w.id === walletId) || null }
        } else {
          return { ...pair, qrdxWallet: qrdxWallets.find(w => w.id === walletId) || null }
        }
      }
      return pair
    })
    setWalletPairs(updatedPairs)
    saveWalletPairs(updatedPairs)
  }

  const handleDeletePair = (pairId: string) => {
    removeWalletPair(pairId)
    setWalletPairs(walletPairs.filter(p => p.id !== pairId))
    if (selectedPairId === pairId) {
      setSelectedPairId(null)
    }
  }

  const handleSelectPair = (pairId: string) => {
    setSelectedPairId(pairId)
    saveSelectedPairId(pairId)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      
      <main className="flex-1 container mx-auto px-4 pt-24 pb-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Wallets</h1>
          <p className="text-muted-foreground">
            Connect and manage your Web3 and quantum-resistant QRDX wallets
          </p>
        </div>

        <Tabs defaultValue="pairs" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pairs">Wallet Pairs</TabsTrigger>
            <TabsTrigger value="web3">Web3 Wallets</TabsTrigger>
            <TabsTrigger value="qrdx">QRDX Wallets</TabsTrigger>
          </TabsList>

          {/* Wallet Pairs Tab */}
          <TabsContent value="pairs" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Wallet Pairs</CardTitle>
                    <CardDescription>
                      Link Web3 and QRDX wallets together for seamless cross-chain trading
                    </CardDescription>
                  </div>
                  <Button onClick={handleCreatePair} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Pair
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {walletPairs.map((pair) => (
                  <Card key={pair.id} className="border-2">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-5 w-5 text-primary" />
                          <Input
                            value={pair.name}
                            onChange={(e) => {
                              setWalletPairs(walletPairs.map(p => 
                                p.id === pair.id ? { ...p, name: e.target.value } : p
                              ))
                            }}
                            className="font-semibold text-lg h-8 w-48"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePair(pair.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Web3 Wallet */}
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Wallet className="h-4 w-4" />
                            Web3 Wallet
                          </Label>
                          <select
                            className="w-full p-2 rounded-md border bg-background"
                            value={pair.web3Wallet?.id || ''}
                            onChange={(e) => handleUpdatePair(pair.id, 'web3', e.target.value || null)}
                          >
                            <option value="">Select Web3 wallet...</option>
                            {web3Wallets.map(wallet => (
                              <option key={wallet.id} value={wallet.id}>
                                {wallet.name} - {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                              </option>
                            ))}
                          </select>
                          {pair.web3Wallet && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {pair.web3Wallet.address}
                            </div>
                          )}
                        </div>

                        {/* QRDX Wallet */}
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            QRDX Wallet
                          </Label>
                          <select
                            className="w-full p-2 rounded-md border bg-background"
                            value={pair.qrdxWallet?.id || ''}
                            onChange={(e) => handleUpdatePair(pair.id, 'qrdx', e.target.value || null)}
                          >
                            <option value="">Select QRDX wallet...</option>
                            {qrdxWallets.map(wallet => (
                              <option key={wallet.id} value={wallet.id}>
                                {wallet.name} - {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                              </option>
                            ))}
                          </select>
                          {pair.qrdxWallet && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {pair.qrdxWallet.address}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Select as Active Pair */}
                      <div className="mt-4 pt-4 border-t">
                        <Button
                          variant={selectedPairId === pair.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleSelectPair(pair.id)}
                          className="w-full gap-2"
                        >
                          {selectedPairId === pair.id ? (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Active Trading Pair
                            </>
                          ) : (
                            <>Set as Active Pair</>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Web3 Wallets Tab */}
          <TabsContent value="web3" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Web3 Wallets</CardTitle>
                    <CardDescription>Traditional Ethereum-compatible wallets</CardDescription>
                  </div>
                  <Button onClick={() => setShowConnectModal('web3')} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Connect Wallet
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {web3Wallets.map((wallet) => (
                  <Card key={wallet.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Wallet className="h-5 w-5" />
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              {wallet.name}
                              {wallet.connected && (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {wallet.address.slice(0, 12)}...{wallet.address.slice(-10)}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(wallet.id, 'web3')}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>

            {/* Connect Web3 Modal */}
            {showConnectModal === 'web3' && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle>Connect Web3 Wallet</CardTitle>
                  <CardDescription>Choose your Web3 wallet provider</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {connectors.map(connector => (
                    <Button
                      key={connector.id}
                      variant="outline"
                      className="w-full justify-start gap-3 h-auto py-4"
                      onClick={() => handleConnectWeb3(connector.id)}
                      disabled={!connector.ready}
                    >
                      <div className="flex items-center gap-3 flex-1 text-left">
                        {connector.icon}
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold">{connector.name}</span>
                          {connector.description && (
                            <span className="text-xs text-muted-foreground font-normal">
                              {connector.description}
                            </span>
                          )}
                        </div>
                      </div>
                      {!connector.ready && (
                        <Badge variant="secondary" className="text-xs">Not Available</Badge>
                      )}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowConnectModal(null)}
                  >
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* QRDX Wallets Tab */}
          <TabsContent value="qrdx" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>QRDX Wallets</CardTitle>
                    <CardDescription>Quantum-resistant wallets with post-quantum security</CardDescription>
                  </div>
                  <Button onClick={() => setShowConnectModal('qrdx')} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Connect Wallet
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {qrdxWallets.map((wallet) => (
                  <Card key={wallet.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Shield className="h-5 w-5 text-primary" />
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              {wallet.name}
                              {wallet.connected && (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              )}
                              <Badge variant="outline" className="gap-1">
                                <Shield className="h-3 w-3" />
                                Quantum-Safe
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {wallet.address.slice(0, 12)}...{wallet.address.slice(-10)}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(wallet.id, 'qrdx')}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>

            {/* Connect QRDX Modal */}
            {showConnectModal === 'qrdx' && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle>Connect QRDX Wallet</CardTitle>
                  <CardDescription>Enter your QRDX wallet details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Wallet Name</Label>
                    <Input
                      id="qrdx-name"
                      placeholder="My QRDX Wallet"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        const input = document.getElementById('qrdx-name') as HTMLInputElement
                        handleConnectQRDX(input?.value || 'QRDX Wallet')
                      }}
                    >
                      Connect
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowConnectModal(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Info Banner */}
        <Card className="mt-8 bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-semibold mb-2">Why Wallet Pairs?</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Wallet pairs enable seamless asset transfers between traditional Web3 and quantum-resistant 
                  QRDX ecosystems. Link your wallets to move funds across the quantum-safe boundary while trading.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Trade with Web3 wallets on traditional chains</li>
                  <li>• Secure assets in QRDX wallets with post-quantum cryptography</li>
                  <li>• Transfer between paired wallets instantly</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  )
}
