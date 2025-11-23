'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, Sparkles } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { TradingChart } from '@/components/TradingChart'
import { SwapInterface } from '@/components/SwapInterface'
import { OrderBook } from '@/components/OrderBook'
import { TradeHistory } from '@/components/TradeHistory'
import { MarketStats } from '@/components/MarketStats'

export default function TradePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />

      <main className="flex-1 container mx-auto px-4 pt-20 py-6">
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
