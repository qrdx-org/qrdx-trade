'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, TrendingDown, Flame, Star } from 'lucide-react'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { TickerBar } from '@/components/TickerBar'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { tokens, formatMarketCap, formatVolume } from '@/lib/tokenRegistry'

export default function TradePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'marketCap' | 'volume' | 'price' | 'change'>('marketCap')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const filteredAndSortedTokens = useMemo(() => {
    let filtered = tokens.filter(token =>
      token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    )

    filtered.sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1
      return (a[sortBy] - b[sortBy]) * multiplier
    })

    return filtered
  }, [searchQuery, sortBy, sortOrder])

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  // Mini sparkline component
  const MiniChart = ({ change }: { change: number }) => {
    const isPositive = change >= 0
    return (
      <div className="w-24 h-8 flex items-end gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => {
          const height = 20 + Math.random() * 80
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm ${isPositive ? 'bg-green-500/30' : 'bg-red-500/30'}`}
              style={{ height: `${height}%` }}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      <TickerBar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-8">
        {/* Header */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-4xl font-bold mb-2">Markets</h1>
            <p className="text-muted-foreground">
              Explore and trade quantum-safe tokens
            </p>
          </motion.div>
        </div>

        {/* Search and Filters */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-4 bg-card/50 backdrop-blur border-0">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tokens..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {filteredAndSortedTokens.length} tokens
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Tokens Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="overflow-hidden bg-card/50 backdrop-blur border-0">
            {/* Table Header */}
            <div className="hidden md:grid md:grid-cols-12 gap-4 p-4 border-b bg-accent/30 text-sm font-medium text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Token</div>
              <div className="col-span-2 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('price')}>
                Price {sortBy === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
              </div>
              <div className="col-span-2 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('change')}>
                24h Change {sortBy === 'change' && (sortOrder === 'asc' ? '↑' : '↓')}
              </div>
              <div className="col-span-2 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('marketCap')}>
                Market Cap {sortBy === 'marketCap' && (sortOrder === 'asc' ? '↑' : '↓')}
              </div>
              <div className="col-span-2 text-right">Chart</div>
            </div>

            {/* Table Body */}
            <div className="divide-y">
              {filteredAndSortedTokens.map((token, index) => (
                <Link key={token.address} href={`/trade/${token.slug}`}>
                  <motion.div
                    className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                  >
                    {/* Rank */}
                    <div className="hidden md:flex col-span-1 items-center text-muted-foreground font-mono">
                      {index + 1}
                    </div>

                    {/* Token Info */}
                    <div className="col-span-1 md:col-span-3 flex items-center gap-3">
                      <span className="text-3xl">{token.logo}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{token.symbol}</span>
                          {token.isPopular && (
                            <Flame className="h-3 w-3 text-orange-500" />
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">{token.name}</span>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="col-span-1 md:col-span-2 flex md:justify-end items-center">
                      <div>
                        <div className="font-mono font-bold">${token.price.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground md:hidden">
                          {formatMarketCap(token.marketCap)}
                        </div>
                      </div>
                    </div>

                    {/* 24h Change */}
                    <div className="col-span-1 md:col-span-2 flex md:justify-end items-center">
                      <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium ${
                        token.change24h >= 0
                          ? 'text-green-500 bg-green-500/10'
                          : 'text-red-500 bg-red-500/10'
                      }`}>
                        {token.change24h >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {Math.abs(token.change24h).toFixed(2)}%
                      </div>
                    </div>

                    {/* Market Cap */}
                    <div className="hidden md:flex md:col-span-2 justify-end items-center">
                      <div className="text-right">
                        <div className="font-mono">{formatMarketCap(token.marketCap)}</div>
                        <div className="text-xs text-muted-foreground">
                          Vol: {formatVolume(token.volume24h)}
                        </div>
                      </div>
                    </div>

                    {/* Mini Chart */}
                    <div className="hidden md:flex md:col-span-2 justify-end items-center">
                      <MiniChart change={token.change24h} />
                    </div>

                    {/* Mobile: Additional Info */}
                    <div className="md:hidden col-span-1 grid grid-cols-2 gap-4 pt-2 border-t mt-2">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Volume 24h</div>
                        <div className="font-mono text-sm">{formatVolume(token.volume24h)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Staking APR</div>
                        <div className="font-medium text-sm text-primary">{token.stakingApr}%</div>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Empty State */}
        {filteredAndSortedTokens.length === 0 && (
          <motion.div
            className="text-center py-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No tokens found</h3>
            <p className="text-muted-foreground">Try adjusting your search query</p>
          </motion.div>
        )}
      </main>

      <Footer />
    </div>
  )
}
