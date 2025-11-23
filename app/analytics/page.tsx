'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Activity, DollarSign, Users, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

// Mock data generators
const generateVolumeData = () => {
  const data = []
  const now = Date.now()
  for (let i = 30; i >= 0; i--) {
    data.push({
      date: new Date(now - i * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      volume: Math.random() * 15000000 + 10000000,
      tvl: Math.random() * 50000000 + 100000000
    })
  }
  return data
}

const generateTokenDistribution = () => [
  { name: 'qETH', value: 35, color: '#8b5cf6' },
  { name: 'QRDX', value: 28, color: '#ec4899' },
  { name: 'qBTC', value: 22, color: '#f59e0b' },
  { name: 'USDT', value: 15, color: '#10b981' },
]

interface TopPool {
  pair: string
  volume24h: string
  tvl: string
  fees: string
  change: number
}

const topPools: TopPool[] = [
  { pair: 'qETH/USDT', volume24h: '$12.4M', tvl: '$45.2M', fees: '$37.2K', change: 12.5 },
  { pair: 'qBTC/qETH', volume24h: '$8.9M', tvl: '$38.7M', fees: '$26.7K', change: 8.3 },
  { pair: 'QRDX/USDT', volume24h: '$5.2M', tvl: '$28.4M', fees: '$15.6K', change: -3.2 },
  { pair: 'qBNB/USDT', volume24h: '$4.1M', tvl: '$19.8M', fees: '$12.3K', change: 5.7 },
  { pair: 'qETH/QRDX', volume24h: '$2.8M', tvl: '$15.3M', fees: '$8.4K', change: 15.8 },
]

export default function AnalyticsPage() {
  const [volumeData, setVolumeData] = useState(generateVolumeData())
  const [selectedTimeframe, setSelectedTimeframe] = useState('30D')
  const tokenDistribution = generateTokenDistribution()

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
              <h1 className="text-4xl font-bold mb-2">Platform Analytics</h1>
              <p className="text-muted-foreground">Comprehensive trading statistics and market insights</p>
            </div>
            <div className="flex items-center gap-2">
              {['24H', '7D', '30D', '1Y'].map((timeframe) => (
                <button
                  key={timeframe}
                  onClick={() => setSelectedTimeframe(timeframe)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTimeframe === timeframe
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-accent hover:bg-accent/80'
                  }`}
                >
                  {timeframe}
                </button>
              ))}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-muted-foreground">24h Volume</div>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-3xl font-bold mb-1">$33.4M</div>
                  <div className="flex items-center text-sm text-green-500">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    +12.5%
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-muted-foreground">Total Value Locked</div>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-3xl font-bold mb-1">$147.4M</div>
                  <div className="flex items-center text-sm text-green-500">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    +8.3%
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-muted-foreground">24h Fees</div>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-3xl font-bold mb-1">$100.2K</div>
                  <div className="flex items-center text-sm text-green-500">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    +5.4%
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-muted-foreground">Active Users</div>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-3xl font-bold mb-1">8,429</div>
                  <div className="flex items-center text-sm text-green-500">
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    +23.7%
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.div>

        {/* Charts Section */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Volume & TVL Chart */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardContent className="p-6">
                <Tabs defaultValue="volume" className="w-full">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Trading Metrics</h2>
                    <TabsList>
                      <TabsTrigger value="volume">Volume</TabsTrigger>
                      <TabsTrigger value="tvl">TVL</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="volume" className="mt-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={volumeData}>
                        <defs>
                          <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#666"
                          tick={{ fontSize: 12 }}
                          interval={4}
                        />
                        <YAxis 
                          stroke="#666"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                          formatter={(value: number) => [`$${(value / 1000000).toFixed(2)}M`, 'Volume']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="volume" 
                          stroke="#8b5cf6" 
                          strokeWidth={2}
                          fill="url(#volumeGradient)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </TabsContent>

                  <TabsContent value="tvl" className="mt-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={volumeData}>
                        <defs>
                          <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#666"
                          tick={{ fontSize: 12 }}
                          interval={4}
                        />
                        <YAxis 
                          stroke="#666"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                          formatter={(value: number) => [`$${(value / 1000000).toFixed(2)}M`, 'TVL']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="tvl" 
                          stroke="#10b981" 
                          strokeWidth={2}
                          fill="url(#tvlGradient)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>

          {/* Token Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-6">Token Distribution</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={tokenDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {tokenDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                      formatter={(value: number) => [`${value}%`, 'Share']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {tokenDistribution.map((token) => (
                    <div key={token.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: token.color }} />
                      <div className="text-sm">
                        <div className="font-medium">{token.name}</div>
                        <div className="text-muted-foreground">{token.value}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Top Pools Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-6">Top Pools by Volume</h2>
              <div className="space-y-2">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">Pool</div>
                  <div className="col-span-2 text-right">24h Volume</div>
                  <div className="col-span-2 text-right">TVL</div>
                  <div className="col-span-2 text-right">24h Fees</div>
                  <div className="col-span-2 text-right">24h Change</div>
                </div>

                {/* Table Rows */}
                {topPools.map((pool, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-accent rounded-lg transition-colors"
                  >
                    <div className="col-span-1 font-mono text-muted-foreground">
                      {index + 1}
                    </div>
                    <div className="col-span-3">
                      <div className="font-semibold">{pool.pair}</div>
                      <div className="text-xs text-muted-foreground">0.3% fee tier</div>
                    </div>
                    <div className="col-span-2 text-right font-mono">{pool.volume24h}</div>
                    <div className="col-span-2 text-right font-mono">{pool.tvl}</div>
                    <div className="col-span-2 text-right font-mono text-green-500">{pool.fees}</div>
                    <div className="col-span-2 text-right">
                      <span className={`flex items-center justify-end gap-1 ${pool.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {pool.change >= 0 ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" />
                        )}
                        {Math.abs(pool.change)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Additional Stats */}
        <motion.div
          className="mt-8 grid md:grid-cols-3 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card>
            <CardContent className="p-6">
              <Activity className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Total Transactions</h3>
              <div className="text-2xl font-bold mb-1">1,247,832</div>
              <p className="text-sm text-muted-foreground">
                +45,382 transactions in the last 24 hours
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <BarChart3 className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Active Pools</h3>
              <div className="text-2xl font-bold mb-1">247</div>
              <p className="text-sm text-muted-foreground">
                Across all trading pairs and fee tiers
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <TrendingUp className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Average APY</h3>
              <div className="text-2xl font-bold mb-1">28.5%</div>
              <p className="text-sm text-muted-foreground">
                Combined staking and liquidity provision rewards
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>
      
      <Footer />
    </div>
  )
}
