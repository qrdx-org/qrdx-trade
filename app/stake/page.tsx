'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Shield, TrendingUp, Lock, Clock, Coins, AlertCircle, Info, ChevronDown, Calculator } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface StakingPool {
  id: string
  name: string
  token: string
  apy: string
  lockPeriod: string
  minStake: string
  totalStaked: string
  rewards: string
}

const stakingPools: StakingPool[] = [
  { id: '1', name: 'Flexible', token: 'QRDX', apy: '12.5%', lockPeriod: 'None', minStake: '100', totalStaked: '$24.5M', rewards: '24h unlock' },
  { id: '2', name: '30 Days', token: 'QRDX', apy: '24.8%', lockPeriod: '30 days', minStake: '100', totalStaked: '$18.2M', rewards: 'Daily compound' },
  { id: '3', name: '90 Days', token: 'QRDX', apy: '38.2%', lockPeriod: '90 days', minStake: '100', totalStaked: '$32.7M', rewards: 'Daily compound' },
  { id: '4', name: '180 Days', token: 'QRDX', apy: '52.5%', lockPeriod: '180 days', minStake: '500', totalStaked: '$45.1M', rewards: 'Daily compound' },
]

export default function StakePage() {
  const [stakeAmount, setStakeAmount] = useState('')
  const [selectedPool, setSelectedPool] = useState<string>('3')
  const [activeTab, setActiveTab] = useState('stake')

  const calculateRewards = () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) return '0.00'
    const pool = stakingPools.find(p => p.id === selectedPool)
    if (!pool) return '0.00'
    const apy = parseFloat(pool.apy) / 100
    const amount = parseFloat(stakeAmount)
    return (amount * apy).toFixed(2)
  }

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
              <h1 className="text-4xl font-bold mb-2">QRDX Staking</h1>
              <p className="text-muted-foreground">Stake your tokens and earn rewards while securing the network</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Quantum Secure</span>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Total Value Staked</div>
                <div className="text-2xl font-bold">$120.5M</div>
                <div className="text-xs text-green-500 mt-1">+8.3% this month</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Total Stakers</div>
                <div className="text-2xl font-bold">12,847</div>
                <div className="text-xs text-green-500 mt-1">+342 this week</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Average APY</div>
                <div className="text-2xl font-bold">32.0%</div>
                <div className="text-xs text-muted-foreground mt-1">Across all pools</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Rewards Distributed</div>
                <div className="text-2xl font-bold">$2.4M</div>
                <div className="text-xs text-muted-foreground mt-1">Last 30 days</div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Staking Pools List */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-6">Staking Pools</h2>
                <div className="space-y-3">
                  {stakingPools.map((pool, index) => (
                    <motion.div
                      key={pool.id}
                      className={`p-5 rounded-lg border-2 transition-all cursor-pointer hover:border-primary/50 ${
                        selectedPool === pool.id ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                      onClick={() => setSelectedPool(pool.id)}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <Coins className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold text-lg">{pool.name}</div>
                            <div className="text-sm text-muted-foreground">{pool.token}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-500">{pool.apy}</div>
                          <div className="text-xs text-muted-foreground">APY</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground flex items-center gap-1 mb-1">
                            <Lock className="h-3 w-3" />
                            Lock Period
                          </div>
                          <div className="font-medium">{pool.lockPeriod}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">Min. Stake</div>
                          <div className="font-medium">{pool.minStake} QRDX</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">Total Staked</div>
                          <div className="font-medium">{pool.totalStaked}</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
                        <div className="text-muted-foreground">{pool.rewards}</div>
                        {selectedPool === pool.id && (
                          <div className="text-primary font-medium">Selected ✓</div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* My Positions */}
            <motion.div
              className="mt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-6">My Staking Positions</h2>
                  <div className="text-center py-12">
                    <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-2">No active staking positions</p>
                    <p className="text-sm text-muted-foreground">Stake tokens to start earning rewards</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          {/* Staking Interface */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="stake">Stake</TabsTrigger>
                    <TabsTrigger value="unstake">Unstake</TabsTrigger>
                  </TabsList>

                  <TabsContent value="stake" className="space-y-4">
                    {/* Amount Input */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Stake Amount</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={stakeAmount}
                          onChange={(e) => setStakeAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 rounded-lg border bg-background text-lg font-mono"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">QRDX</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-2">
                        <span className="text-muted-foreground">Balance: 1,234.56 QRDX</span>
                        <Button variant="ghost" size="sm" onClick={() => setStakeAmount('1234.56')}>
                          Max
                        </Button>
                      </div>
                    </div>

                    {/* Quick Amount Buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      {['25%', '50%', '75%', '100%'].map((percent) => (
                        <Button
                          key={percent}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const balance = 1234.56
                            const percentage = parseFloat(percent) / 100
                            setStakeAmount((balance * percentage).toFixed(2))
                          }}
                        >
                          {percent}
                        </Button>
                      ))}
                    </div>

                    {/* Selected Pool Info */}
                    <div className="p-4 rounded-lg bg-accent space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Selected Pool</span>
                        <span className="font-medium">
                          {stakingPools.find(p => p.id === selectedPool)?.name || 'None'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">APY</span>
                        <span className="font-bold text-green-500">
                          {stakingPools.find(p => p.id === selectedPool)?.apy || '0%'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lock Period</span>
                        <span className="font-medium">
                          {stakingPools.find(p => p.id === selectedPool)?.lockPeriod || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Rewards Calculator */}
                    <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                      <div className="flex items-center gap-2 mb-3">
                        <Calculator className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Estimated Annual Rewards</span>
                      </div>
                      <div className="text-3xl font-bold text-primary mb-1">
                        {calculateRewards()} QRDX
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ≈ ${(parseFloat(calculateRewards()) * 1.85).toFixed(2)} USD
                      </div>
                    </div>

                    <Button className="w-full" size="lg" disabled={!stakeAmount || parseFloat(stakeAmount) <= 0}>
                      Stake QRDX
                    </Button>

                    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <p className="text-blue-500">
                        Your staked tokens will be locked for the selected period. Early unstaking may incur penalties.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="unstake" className="space-y-4">
                    <div className="text-center py-12">
                      <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground mb-2">No active positions to unstake</p>
                      <p className="text-sm text-muted-foreground">Stake tokens first to see your positions here</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Info Section */}
        <motion.div
          className="mt-8 grid md:grid-cols-3 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-6">
              <TrendingUp className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Earn High APY</h3>
              <p className="text-sm text-muted-foreground">
                Earn up to 52.5% APY on your staked QRDX tokens with daily compounding rewards
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Shield className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Quantum Secure</h3>
              <p className="text-sm text-muted-foreground">
                All staked assets are protected by post-quantum cryptography ensuring long-term security
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Clock className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2">Flexible Options</h3>
              <p className="text-sm text-muted-foreground">
                Choose from flexible to 180-day lock periods with higher APYs for longer commitments
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>
      
      <Footer />
    </div>
  )
}
