'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Coins, Zap, TrendingUp } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'

export default function StakePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1 container mx-auto px-4 py-24">
        <motion.div
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-primary/10 mb-6">
            <Coins className="h-12 w-12 text-primary" />
          </div>
          
          <h1 className="text-4xl font-bold mb-4">Stake QRDX</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Stake your QRDX tokens and earn rewards while securing the network
          </p>
          
          <div className="flex items-center justify-center gap-4 mb-12">
            <Button size="lg" className="gap-2">
              <Zap className="h-5 w-5" />
              Start Staking
            </Button>
            <Button size="lg" variant="outline" className="gap-2">
              <TrendingUp className="h-5 w-5" />
              View Stats
            </Button>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 text-left">
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">High APY</h3>
              <p className="text-sm text-muted-foreground">
                Earn up to 24.5% annual percentage yield on staked tokens
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Network Security</h3>
              <p className="text-sm text-muted-foreground">
                Help secure the QRDX network with quantum-resistant validation
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Instant Rewards</h3>
              <p className="text-sm text-muted-foreground">
                Receive staking rewards distributed every epoch (≈6 hours)
              </p>
            </div>
          </div>
        </motion.div>
      </main>
      
      <Footer />
    </div>
  )
}
