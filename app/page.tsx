'use client'

import React from 'react'
import { ArrowDownUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

export default function TradePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2">Trade Quantum-Safe Assets</h1>
            <p className="text-muted-foreground">
              Swap tokens with post-quantum cryptographic security
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Trading Interface */}
            <Card>
              <CardHeader>
                <CardTitle>Swap</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">From</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.0"
                      className="flex-1 px-3 py-2 border rounded-md"
                    />
                    <Button variant="outline">qETH</Button>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <ArrowDownUp className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">To</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.0"
                      className="flex-1 px-3 py-2 border rounded-md"
                    />
                    <Button variant="outline">qBTC</Button>
                  </div>
                </div>

                <Button className="w-full" size="lg">
                  Connect Wallet
                </Button>
              </CardContent>
            </Card>

            {/* Market Info */}
            <Card>
              <CardHeader>
                <CardTitle>Market Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">1 qETH = 0.065 qBTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">24h Volume</span>
                  <span className="font-medium">$847.2M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liquidity</span>
                  <span className="font-medium">$156.8M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-medium">0.3%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Trades */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                Connect your wallet to view recent trades
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  )
}
