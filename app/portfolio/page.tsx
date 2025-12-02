'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, TrendingUp, TrendingDown, X, BarChart3, Shield, RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface Position {
  id: string
  token: string
  type: 'long' | 'short'
  entryPrice: number
  currentPrice: number
  size: number
  leverage: number
  pnl: number
  pnlPercent: number
  liquidationPrice: number
  walletType: 'web3' | 'qrdx'
}

interface BalanceItem {
  token: string
  balance: number
  value: number
  walletType: 'web3' | 'qrdx'
}

export default function PortfolioPage() {
  const [activeWallet, setActiveWallet] = useState<'all' | 'web3' | 'qrdx'>('all')

  // Mock data for balances
  const balances: BalanceItem[] = [
    { token: 'ETH', balance: 2.5, value: 8750, walletType: 'web3' },
    { token: 'USDT', balance: 15000, value: 15000, walletType: 'web3' },
    { token: 'qBTC', balance: 0.15, value: 9750, walletType: 'qrdx' },
    { token: 'QRDX', balance: 50000, value: 12500, walletType: 'qrdx' },
    { token: 'qETH', balance: 3.2, value: 11200, walletType: 'qrdx' },
  ]

  // Mock data for open positions
  const positions: Position[] = [
    {
      id: '1',
      token: 'ETH',
      type: 'long',
      entryPrice: 3400,
      currentPrice: 3500,
      size: 1.5,
      leverage: 5,
      pnl: 750,
      pnlPercent: 8.82,
      liquidationPrice: 2720,
      walletType: 'web3'
    },
    {
      id: '2',
      token: 'qBTC',
      type: 'long',
      entryPrice: 64000,
      currentPrice: 65000,
      size: 0.5,
      leverage: 3,
      pnl: 1500,
      pnlPercent: 7.81,
      liquidationPrice: 42667,
      walletType: 'qrdx'
    },
    {
      id: '3',
      token: 'SOL',
      type: 'short',
      entryPrice: 105,
      currentPrice: 102,
      size: 100,
      leverage: 10,
      pnl: 300,
      pnlPercent: 2.86,
      liquidationPrice: 115.5,
      walletType: 'web3'
    },
  ]

  // Filter based on active wallet
  const filteredBalances = activeWallet === 'all' 
    ? balances 
    : balances.filter(b => b.walletType === activeWallet)

  const filteredPositions = activeWallet === 'all' 
    ? positions 
    : positions.filter(p => p.walletType === activeWallet)

  const totalBalance = filteredBalances.reduce((sum, b) => sum + b.value, 0)
  const totalPnL = filteredPositions.reduce((sum, p) => sum + p.pnl, 0)
  const totalPnLPercent = filteredPositions.length > 0 
    ? (totalPnL / filteredPositions.reduce((sum, p) => sum + (p.size * p.entryPrice), 0)) * 100 
    : 0

  const handleClosePosition = (positionId: string) => {
    console.log('Closing position:', positionId)
    // TODO: Implement actual position closing logic
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      
      <main className="flex-1 container mx-auto px-4 pt-24 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
            <p className="text-muted-foreground">Manage your assets across Web3 and QRDX wallets</p>
          </div>
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Wallet Type Filter */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeWallet === 'all' ? 'default' : 'outline'}
            onClick={() => setActiveWallet('all')}
            className="gap-2"
          >
            <Wallet className="h-4 w-4" />
            All Wallets
          </Button>
          <Button
            variant={activeWallet === 'web3' ? 'default' : 'outline'}
            onClick={() => setActiveWallet('web3')}
            className="gap-2"
          >
            <Wallet className="h-4 w-4" />
            Web3
          </Button>
          <Button
            variant={activeWallet === 'qrdx' ? 'default' : 'outline'}
            onClick={() => setActiveWallet('qrdx')}
            className="gap-2"
          >
            <Shield className="h-4 w-4" />
            QRDX (Quantum-Safe)
          </Button>
        </div>

        {/* Balance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${totalBalance.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {filteredBalances.length} assets
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-3xl font-bold flex items-center gap-2",
                totalPnL >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {totalPnL >= 0 ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
                ${Math.abs(totalPnL).toLocaleString()}
              </div>
              <p className={cn(
                "text-sm mt-1",
                totalPnL >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {totalPnL >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{filteredPositions.length}</div>
              <p className="text-sm text-muted-foreground mt-1">
                Active trades
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="positions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="positions">Open Positions</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
          </TabsList>

          {/* Open Positions Tab */}
          <TabsContent value="positions" className="space-y-4">
            {filteredPositions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No open positions</p>
                </CardContent>
              </Card>
            ) : (
              filteredPositions.map((position) => (
                <motion.div
                  key={position.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="hover:bg-accent/50 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                        {/* Token & Type */}
                        <div className="flex items-center gap-3 lg:w-48">
                          <div className="text-3xl">
                            {position.token === 'ETH' && '💎'}
                            {position.token === 'qBTC' && '₿'}
                            {position.token === 'SOL' && '☀️'}
                          </div>
                          <div>
                            <div className="font-bold text-lg">{position.token}/USDT</div>
                            <div className="flex items-center gap-2">
                              <Badge variant={position.type === 'long' ? 'default' : 'destructive'}>
                                {position.type === 'long' ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                {position.type.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="gap-1">
                                {position.walletType === 'qrdx' ? <Shield className="h-3 w-3" /> : <Wallet className="h-3 w-3" />}
                                {position.walletType === 'qrdx' ? 'QRDX' : 'Web3'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Position Details */}
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Size</div>
                            <div className="font-mono font-medium">{position.size} {position.token}</div>
                            <div className="text-xs text-muted-foreground">{position.leverage}x</div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Entry Price</div>
                            <div className="font-mono">${position.entryPrice.toLocaleString()}</div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Current Price</div>
                            <div className="font-mono">${position.currentPrice.toLocaleString()}</div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Liquidation</div>
                            <div className="font-mono text-red-500">${position.liquidationPrice.toLocaleString()}</div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">P&L</div>
                            <div className={cn(
                              "font-bold",
                              position.pnl >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                              {position.pnl >= 0 ? '+' : ''}${position.pnl.toLocaleString()}
                            </div>
                            <div className={cn(
                              "text-xs",
                              position.pnl >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                              {position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 lg:w-48 lg:justify-end">
                          <Link href={`/trade/${position.token.toLowerCase()}/usdt`}>
                            <Button variant="outline" size="sm" className="gap-2">
                              <BarChart3 className="h-4 w-4" />
                              Chart
                            </Button>
                          </Link>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleClosePosition(position.id)}
                            className="gap-2"
                          >
                            <X className="h-4 w-4" />
                            Close
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </TabsContent>

          {/* Balances Tab */}
          <TabsContent value="balances" className="space-y-4">
            {filteredBalances.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No balances found</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {filteredBalances.map((balance, idx) => (
                      <motion.div
                        key={balance.token}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className="p-4 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-3xl">
                              {balance.token === 'ETH' && '💎'}
                              {balance.token === 'USDT' && '💵'}
                              {balance.token === 'qBTC' && '₿'}
                              {balance.token === 'QRDX' && '🔷'}
                              {balance.token === 'qETH' && '💎'}
                            </div>
                            <div>
                              <div className="font-bold">{balance.token}</div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="gap-1 text-xs">
                                  {balance.walletType === 'qrdx' ? <Shield className="h-3 w-3" /> : <Wallet className="h-3 w-3" />}
                                  {balance.walletType === 'qrdx' ? 'QRDX' : 'Web3'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="font-mono font-bold">{balance.balance.toLocaleString()}</div>
                            <div className="text-sm text-muted-foreground">${balance.value.toLocaleString()}</div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
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
                <h3 className="font-semibold mb-1">Cross-Chain Quantum Protection</h3>
                <p className="text-sm text-muted-foreground">
                  QRDX Exchange allows you to seamlessly move assets between traditional Web3 wallets 
                  and quantum-resistant QRDX wallets. Transfer your holdings to QRDX wallets for 
                  post-quantum cryptographic protection while maintaining full trading capabilities.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  )
}
