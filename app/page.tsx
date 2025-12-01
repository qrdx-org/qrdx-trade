'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, Sparkles, TrendingUp, ArrowRight, Activity, Users, Lock } from 'lucide-react'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { MarketStats } from '@/components/MarketStats'
import { TickerBar } from '@/components/TickerBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { tokens } from '@/lib/tokenRegistry'

export default function HomePage() {
  const trendingTokens = tokens.filter(t => t.isPopular).slice(0, 6)
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      <TickerBar />

      <main className="flex-1 pt-24 pb-8">
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Quantum-Resistant Trading</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
              Trade the Future
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              The first quantum-safe decentralized exchange. Trade with confidence knowing your assets are protected by post-quantum cryptography.
            </p>
            
            <div className="flex items-center justify-center gap-4">
              <Link href="/trade">
                <Button size="lg" className="h-12 px-8 text-base font-semibold">
                  Start Trading
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/pools">
                <Button size="lg" variant="outline" className="h-12 px-8 text-base font-semibold">
                  Explore Pools
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Market Stats */}
        <section className="container mx-auto px-4 mb-12">
          <MarketStats />
        </section>

        {/* Platform Stats */}
        <section className="container mx-auto px-4 mb-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: 'Total Volume', value: '$1.2B', icon: Activity, change: '+12.5%' },
              { label: 'Active Users', value: '125K', icon: Users, change: '+8.3%' },
              { label: 'Total Value Locked', value: '$456M', icon: Lock, change: '+15.2%' },
              { label: 'Transactions', value: '2.5M', icon: TrendingUp, change: '+22.1%' },
            ].map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="border-0 bg-card/50 backdrop-blur">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <stat.icon className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium text-green-500">{stat.change}</span>
                    </div>
                    <p className="text-3xl font-bold mb-1">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Trending Tokens */}
        <section className="container mx-auto px-4 mb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold">Trending Tokens</h2>
            <Link href="/trade">
              <Button variant="ghost">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendingTokens.map((token, idx) => (
              <motion.div
                key={token.symbol}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Link href={`/trade/${token.slug}`}>
                  <Card className="border-0 bg-card/50 backdrop-blur hover:bg-accent/50 transition-all hover:scale-[1.02] cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{token.logo}</span>
                          <div>
                            <h3 className="font-bold text-lg">{token.symbol}</h3>
                            <p className="text-sm text-muted-foreground">{token.name}</p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${
                          token.change24h >= 0 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'
                        }`}>
                          <TrendingUp className={`h-3 w-3 ${token.change24h < 0 ? 'rotate-180' : ''}`} />
                          {Math.abs(token.change24h).toFixed(2)}%
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Price</span>
                          <span className="font-mono font-bold">${token.price.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">APR</span>
                          <span className="font-medium text-primary">{token.stakingApr}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose QRDX Trade?</h2>
            <p className="text-lg text-muted-foreground">The most secure and advanced trading platform</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: 'Quantum-Resistant Security',
                description: 'Your assets are protected by post-quantum cryptographic algorithms, ensuring security even against future quantum computers.'
              },
              {
                icon: Zap,
                title: 'Lightning Fast',
                description: 'Experience sub-second transaction finality on the QRDX Chain with ultra-low latency trading.'
              },
              {
                icon: Sparkles,
                title: 'Low Fees',
                description: 'Trade with minimal costs. Average transaction fees under $0.50, making DeFi accessible to everyone.'
              }
            ].map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
              >
                <Card className="border-0 bg-card/50 backdrop-blur h-full">
                  <CardContent className="p-8">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="container mx-auto px-4">
          <motion.div
            className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-background border p-12 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="relative z-10">
              <h2 className="text-4xl font-bold mb-4">Ready to Start Trading?</h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of traders already using the most secure decentralized exchange
              </p>
              <Link href="/trade">
                <Button size="lg" className="h-14 px-8 text-lg font-semibold">
                  Launch App
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
