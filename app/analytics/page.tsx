'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Activity } from 'lucide-react'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'

export default function AnalyticsPage() {
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
            <BarChart3 className="h-12 w-12 text-primary" />
          </div>
          
          <h1 className="text-4xl font-bold mb-4">Analytics</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Comprehensive insights into QRDX trading activity and performance
          </p>
          
          <div className="flex items-center justify-center gap-4 mb-12">
            <Button size="lg" className="gap-2">
              <TrendingUp className="h-5 w-5" />
              View Charts
            </Button>
            <Button size="lg" variant="outline" className="gap-2">
              <Activity className="h-5 w-5" />
              Export Data
            </Button>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 text-left">
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Real-time Data</h3>
              <p className="text-sm text-muted-foreground">
                Live updates on trading volume, liquidity, and price movements
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Historical Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Access comprehensive historical data and trading patterns
              </p>
            </div>
            <div className="p-6 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Custom Reports</h3>
              <p className="text-sm text-muted-foreground">
                Generate detailed reports for tax and accounting purposes
              </p>
            </div>
          </div>
        </motion.div>
      </main>
      
      <Footer />
    </div>
  )
}
