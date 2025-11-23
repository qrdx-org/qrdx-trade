'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Droplets, Plus, TrendingUp, Search, Filter, ChevronDown, Star, ExternalLink, Info } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Pool {
  id: string
  pair: string
  tokens: [string, string]
  tvl: string
  volume24h: string
  fees24h: string
  apr: string
  favorite: boolean
}

const mockPools: Pool[] = [
  { id: '1', pair: 'qETH/USDT', tokens: ['qETH', 'USDT'], tvl: '$45.2M', volume24h: '$12.4M', fees24h: '$37.2K', apr: '42.5%', favorite: false },
  { id: '2', pair: 'qBTC/qETH', tokens: ['qBTC', 'qETH'], tvl: '$38.7M', volume24h: '$8.9M', fees24h: '$26.7K', apr: '38.2%', favorite: true },
  { id: '3', pair: 'QRDX/USDT', tokens: ['QRDX', 'USDT'], tvl: '$28.4M', volume24h: '$5.2M', fees24h: '$15.6K', apr: '28.9%', favorite: true },
  { id: '4', pair: 'qBNB/USDT', tokens: ['qBNB', 'USDT'], tvl: '$19.8M', volume24h: '$4.1M', fees24h: '$12.3K', apr: '31.4%', favorite: false },
  { id: '5', pair: 'qETH/QRDX', tokens: ['qETH', 'QRDX'], tvl: '$15.3M', volume24h: '$2.8M', fees24h: '$8.4K', apr: '24.7%', favorite: false },
]

export default function PoolsPage() {
  const [pools, setPools] = useState(mockPools)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const toggleFavorite = (id: string) => {
    setPools(pools.map(pool => 
      pool.id === id ? { ...pool, favorite: !pool.favorite } : pool
    ))
  }

  const filteredPools = pools.filter(pool => {
    const matchesSearch = pool.pair.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTab = activeTab === 'all' || (activeTab === 'favorites' && pool.favorite)
    return matchesSearch && matchesTab
  })

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      
      <main className="flex-1 container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">Liquidity Pools</h1>
              <p className="text-muted-foreground">Provide liquidity and earn trading fees</p>
            </div>
            <Button size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              New Position
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Total Value Locked</div>
                <div className="text-2xl font-bold">$147.4M</div>
                <div className="text-xs text-green-500 mt-1">+12.3% this week</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">24h Volume</div>
                <div className="text-2xl font-bold">$33.4M</div>
                <div className="text-xs text-green-500 mt-1">+8.7% from yesterday</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">24h Fees</div>
                <div className="text-2xl font-bold">$100.2K</div>
                <div className="text-xs text-green-500 mt-1">+5.4% from yesterday</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Active Pools</div>
                <div className="text-2xl font-bold">247</div>
                <div className="text-xs text-muted-foreground mt-1">Across all pairs</div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Pools Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <TabsList>
                    <TabsTrigger value="all">All Pools</TabsTrigger>
                    <TabsTrigger value="favorites">Favorites</TabsTrigger>
                    <TabsTrigger value="my-positions">My Positions</TabsTrigger>
                  </TabsList>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search pools..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 border rounded-lg bg-background w-64"
                      />
                    </div>
                    <Button variant="outline" size="icon">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <TabsContent value="all" className="mt-0">
                  <div className="space-y-2">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                      <div className="col-span-3">Pool</div>
                      <div className="col-span-2 text-right">TVL</div>
                      <div className="col-span-2 text-right">Volume 24h</div>
                      <div className="col-span-2 text-right">Fees 24h</div>
                      <div className="col-span-2 text-right">APR</div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* Table Rows */}
                    {filteredPools.map((pool, index) => (
                      <motion.div
                        key={pool.id}
                        className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-accent rounded-lg transition-colors cursor-pointer group"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div className="col-span-3 flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFavorite(pool.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Star className={`h-4 w-4 ${pool.favorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
                          </button>
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              <div className="h-8 w-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-bold">
                                {pool.tokens[0].slice(0, 1)}
                              </div>
                              <div className="h-8 w-8 rounded-full bg-secondary/20 border-2 border-background flex items-center justify-center text-xs font-bold">
                                {pool.tokens[1].slice(0, 1)}
                              </div>
                            </div>
                            <div>
                              <div className="font-semibold">{pool.pair}</div>
                              <div className="text-xs text-muted-foreground">0.3% fee</div>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2 text-right font-mono">{pool.tvl}</div>
                        <div className="col-span-2 text-right font-mono">{pool.volume24h}</div>
                        <div className="col-span-2 text-right font-mono text-green-500">{pool.fees24h}</div>
                        <div className="col-span-2 text-right">
                          <span className="font-bold text-green-500">{pool.apr}</span>
                        </div>
                        <div className="col-span-1 flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost">
                            Add
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="favorites" className="mt-0">
                  {filteredPools.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                        <div className="col-span-3">Pool</div>
                        <div className="col-span-2 text-right">TVL</div>
                        <div className="col-span-2 text-right">Volume 24h</div>
                        <div className="col-span-2 text-right">Fees 24h</div>
                        <div className="col-span-2 text-right">APR</div>
                        <div className="col-span-1"></div>
                      </div>
                      {filteredPools.map((pool, index) => (
                        <div key={pool.id} className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-accent rounded-lg transition-colors cursor-pointer">
                          <div className="col-span-3 flex items-center gap-3">
                            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-2">
                                <div className="h-8 w-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-bold">
                                  {pool.tokens[0].slice(0, 1)}
                                </div>
                                <div className="h-8 w-8 rounded-full bg-secondary/20 border-2 border-background flex items-center justify-center text-xs font-bold">
                                  {pool.tokens[1].slice(0, 1)}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold">{pool.pair}</div>
                                <div className="text-xs text-muted-foreground">0.3% fee</div>
                              </div>
                            </div>
                          </div>
                          <div className="col-span-2 text-right font-mono">{pool.tvl}</div>
                          <div className="col-span-2 text-right font-mono">{pool.volume24h}</div>
                          <div className="col-span-2 text-right font-mono text-green-500">{pool.fees24h}</div>
                          <div className="col-span-2 text-right">
                            <span className="font-bold text-green-500">{pool.apr}</span>
                          </div>
                          <div className="col-span-1 flex items-center justify-end">
                            <Button size="sm" variant="ghost">Add</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">No favorite pools yet</p>
                      <p className="text-sm text-muted-foreground mt-2">Star pools to add them to your favorites</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="my-positions" className="mt-0">
                  <div className="text-center py-12">
                    <Droplets className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">No liquidity positions found</p>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Create Position
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        {/* Info Banner */}
        <motion.div
          className="mt-8 p-6 rounded-xl bg-primary/5 border border-primary/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-start gap-4">
            <Info className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold mb-2">How Liquidity Pools Work</h3>
              <p className="text-sm text-muted-foreground mb-4">
                When you add liquidity to a pool, you'll receive LP tokens representing your share. These tokens earn a portion of all trading fees (0.3%) proportional to your pool share. You can remove liquidity anytime by redeeming your LP tokens.
              </p>
              <a href="#" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                Learn more about providing liquidity
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </motion.div>
      </main>
      
      <Footer />
    </div>
  )
}
