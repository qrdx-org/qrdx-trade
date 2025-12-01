'use client'

import React, { use } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, Star } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { TickerBar } from '@/components/TickerBar'
import { TradingChart } from '@/components/TradingChart'
import { SwapInterface } from '@/components/SwapInterface'
import { OrderBook } from '@/components/OrderBook'
import { TradeHistory } from '@/components/TradeHistory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getTokenBySlug, getTokenByAddress, formatMarketCap, formatVolume } from '@/lib/tokenRegistry'

interface PageProps {
  params: Promise<{ token: string }>
}

export default function TokenTradePage({ params }: PageProps) {
  const { token: tokenParam } = use(params)
  
  // Try to find token by slug or address
  const token = getTokenBySlug(tokenParam) || getTokenByAddress(tokenParam)
  
  if (!token) {
    notFound()
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      <TickerBar />

      <main className="flex-1 pt-20 pb-8">
        {/* Token Header */}
        <div className="border-b bg-card/30 backdrop-blur">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/trade">
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{token.logo}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-bold">{token.symbol}/USDT</h1>
                      {token.isPopular && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{token.name}</p>
                  </div>
                </div>
              </div>

              <Button variant="ghost" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                View on Explorer
              </Button>
            </div>

            {/* Token Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Price</div>
                <div className="font-mono font-bold text-lg">${token.price.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">24h Change</div>
                <div className={`font-bold text-lg ${token.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
                <div className="font-mono font-bold">{formatMarketCap(token.marketCap)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
                <div className="font-mono font-bold">{formatVolume(token.volume24h)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Staking APR</div>
                <div className="font-bold text-primary">{token.stakingApr}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Trading Interface */}
        <div className="container mx-auto px-4 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Sidebar - Order Book */}
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

          {/* Token Info Section */}
          <motion.div
            className="mt-8 grid md:grid-cols-2 gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-card/50 backdrop-blur border-0">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold mb-4">About {token.name}</h3>
                <p className="text-muted-foreground mb-4">
                  {token.name} ({token.symbol}) is a quantum-resistant cryptocurrency trading on the QRDX Chain. 
                  It features post-quantum cryptographic security, ensuring your assets remain protected even against 
                  future quantum computing threats.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contract Address</span>
                    <span className="font-mono text-xs">{token.address.slice(0, 10)}...{token.address.slice(-8)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Network</span>
                    <span>QRDX Chain</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur border-0">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold mb-4">Key Metrics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fully Diluted Valuation</span>
                    <span className="font-mono font-bold">{formatMarketCap(token.marketCap * 1.2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Circulating Supply</span>
                    <span className="font-mono">{(token.marketCap / token.price).toFixed(0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Supply</span>
                    <span className="font-mono">{((token.marketCap / token.price) * 1.2).toFixed(0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Staking Rewards</span>
                    <span className="font-bold text-primary">{token.stakingApr}% APR</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
