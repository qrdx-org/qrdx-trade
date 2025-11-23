'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Droplets, Plus, TrendingUp } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'

export default function PoolsPage() {
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
            <Droplets className="h-12 w-12 text-primary" />
          </div>
          
          <h1 className="text-4xl font-bold mb-4">Liquidity Pools</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Provide liquidity and earn fees from trades
          </p>
          
          <div className="flex items-center justify-center gap-4 mb-12">
            <Button size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Add Liquidity
            </Button>
            <Button size="lg" variant="outline" className="gap-2">
              <TrendingUp className="h-5 w-5" />
              View Pools
            </Button>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 text-left">
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Earn Trading Fees</h3>
              <p className="text-sm text-muted-foreground">
                Receive a portion of trading fees proportional to your share of the pool
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Quantum Secure</h3>
              <p className="text-sm text-muted-foreground">
                All liquidity is protected by post-quantum cryptography
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Flexible Deposits</h3>
              <p className="text-sm text-muted-foreground">
                Add or remove liquidity at any time with no lock-up period
              </p>
            </div>
          </div>
        </motion.div>
      </main>
      
      <Footer />
    </div>
  )
}
