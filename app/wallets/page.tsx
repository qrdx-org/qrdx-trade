'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Shield, Plus, Trash2, CheckCircle2, Link2, ExternalLink } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface WalletConnection {
  id: string
  type: 'web3' | 'qrdx'
  address: string
  name: string
  provider?: string
  connected: boolean
}

interface WalletPair {
  id: string
  name: string
  web3Wallet: WalletConnection | null
  qrdxWallet: WalletConnection | null
}

export default function WalletsPage() {
  const [web3Wallets, setWeb3Wallets] = useState<WalletConnection[]>([])
  const [qrdxWallets, setQrdxWallets] = useState<WalletConnection[]>([])
  const [walletPairs, setWalletPairs] = useState<WalletPair[]>([])
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null)
  const [showConnectModal, setShowConnectModal] = useState<'web3' | 'qrdx' | null>(null)

  // Load state from storage on mount
  React.useEffect(() => {
    try {
      const storedWeb3 = localStorage.getItem('web3Wallets')
      const storedQrdx = localStorage.getItem('qrdxWallets')
      const storedPairs = localStorage.getItem('walletPairs')
      const storedSelectedPair = sessionStorage.getItem('selectedWalletPair')

      if (storedWeb3) setWeb3Wallets(JSON.parse(storedWeb3))
      if (storedQrdx) setQrdxWallets(JSON.parse(storedQrdx))
      if (storedPairs) setWalletPairs(JSON.parse(storedPairs))
      if (storedSelectedPair) setSelectedPairId(storedSelectedPair)
    } catch (error) {
      console.error('Error loading wallet data:', error)
    }
  }, [])

  const handleConnectWeb3 = (provider: string) => {
    // Mock wallet connection
    const newWallet: WalletConnection = {
      id: Date.now().toString(),
      type: 'web3',
      address: `0x${Math.random().toString(16).substr(2, 40)}`,
      name: provider,
      provider,
      connected: true
    }
    setWeb3Wallets([...web3Wallets, newWallet])
    setShowConnectModal(null)
    
    // Store in localStorage
    localStorage.setItem('web3Wallets', JSON.stringify([...web3Wallets, newWallet]))
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
    setQrdxWallets([...qrdxWallets, newWallet])
    setShowConnectModal(null)
    
    // Store in localStorage
    localStorage.setItem('qrdxWallets', JSON.stringify([...qrdxWallets, newWallet]))
  }

  const handleDisconnect = (id: string, type: 'web3' | 'qrdx') => {
    if (type === 'web3') {
      const updated = web3Wallets.filter(w => w.id !== id)
      setWeb3Wallets(updated)
      localStorage.setItem('web3Wallets', JSON.stringify(updated))
    } else {
      const updated = qrdxWallets.filter(w => w.id !== id)
      setQrdxWallets(updated)
      localStorage.setItem('qrdxWallets', JSON.stringify(updated))
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
    localStorage.setItem('walletPairs', JSON.stringify(updatedPairs))
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
    localStorage.setItem('walletPairs', JSON.stringify(updatedPairs))
  }

  const handleDeletePair = (pairId: string) => {
    const updatedPairs = walletPairs.filter(p => p.id !== pairId)
    setWalletPairs(updatedPairs)
    localStorage.setItem('walletPairs', JSON.stringify(updatedPairs))
    if (selectedPairId === pairId) {
      sessionStorage.removeItem('selectedWalletPair')
      setSelectedPairId(null)
    }
  }

  const handleSelectPair = (pairId: string) => {
    setSelectedPairId(pairId)
    sessionStorage.setItem('selectedWalletPair', pairId)
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
                  {['MetaMask', 'WalletConnect', 'Coinbase Wallet', 'Rainbow'].map(provider => (
                    <Button
                      key={provider}
                      variant="outline"
                      className="w-full justify-start gap-3"
                      onClick={() => handleConnectWeb3(provider)}
                    >
                      <Wallet className="h-5 w-5" />
                      {provider}
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
