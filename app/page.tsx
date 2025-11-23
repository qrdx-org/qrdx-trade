'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, Lock, Sparkles } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { TradingChart } from '@/components/TradingChart'
import { SwapInterface } from '@/components/SwapInterface'
import { OrderBook } from '@/components/OrderBook'
import { TradeHistory } from '@/components/TradeHistory'
import { MarketStats } from '@/components/MarketStats'
import { WalletConnect, WalletType } from '@/components/WalletConnect'

export default function TradePage() {
  const [walletType, setWalletType] = useState<WalletType>(null)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      
      {/* Header with Wallet Connection */}
      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <motion.div 
              className="flex items-center gap-6"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h1 className="text-2xl font-bold">Trade</h1>
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Quantum-Safe Trading</span>
              </div>
              {walletType && (
                <motion.div 
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-xs font-medium"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  {walletType === 'web3' ? (
                    <>
                      <Zap className="h-3 w-3 text-blue-500" />
                      <span>Web3 Mode</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3 text-purple-500" />
                      <span>QRDX Chain</span>
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>
            
            <WalletConnect onConnect={setWalletType} />
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Market Stats */}
        <div className="mb-6">
          <MarketStats />
        </div>

        {/* Main Trading Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
          {/* Left Column - Order Book */}
          <div className="xl:col-span-3">
            <div className="h-[600px]">
              <OrderBook />
            </div>
          </div>

          {/* Center Column - Chart and Swap */}
          <div className="xl:col-span-6 space-y-6">
            <TradingChart />
            <SwapInterface />
          </div>

          {/* Right Column - Trade History */}
          <div className="xl:col-span-3">
            <div className="h-[600px]">
              <TradeHistory />
            </div>
          </div>
        </div>

        {/* Features Banner */}
        <motion.div
          className="mt-8 p-6 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-secondary/10 border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Quantum-Resistant</h3>
                <p className="text-sm text-muted-foreground">
                  Protected by post-quantum cryptographic algorithms
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Lightning Fast</h3>
                <p className="text-sm text-muted-foreground">
                  Sub-second transaction finality on QRDX Chain
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Low Fees</h3>
                <p className="text-sm text-muted-foreground">
                  Average transaction cost under $0.50
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  )
}
