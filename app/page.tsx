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
import { TickerBar } from '@/components/TickerBar'

export default function TradePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      <TickerBar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-8">
        {/* Market Stats */}
        <div className="mb-4">
          <MarketStats />
        </div>

        {/* Main Trading Layout - Cleaner Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Sidebar - Order Book (Collapsible) */}
          <div className="lg:col-span-3 order-3 lg:order-1">
            <div className="sticky top-4">
              <OrderBook />
            </div>
          </div>

          {/* Center - Chart and Swap */}
          <div className="lg:col-span-6 space-y-4 order-1 lg:order-2">
            {/* Trading Chart */}
            <div className="w-full">
              <TradingChart />
            </div>
            
            {/* Swap Interface */}
            <div className="w-full max-w-2xl mx-auto">
              <SwapInterface />
            </div>
          </div>

          {/* Right Sidebar - Trade History */}
          <div className="lg:col-span-3 order-2 lg:order-3">
            <div className="sticky top-4">
              <TradeHistory />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
