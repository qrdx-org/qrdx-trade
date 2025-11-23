'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownUp, Settings, Info, TrendingUp, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Token {
  symbol: string
  name: string
  balance: number
  logo: string
}

const tokens: Token[] = [
  { symbol: 'qETH', name: 'Quantum Ethereum', balance: 2.5432, logo: '💎' },
  { symbol: 'qBTC', name: 'Quantum Bitcoin', balance: 0.1234, logo: '₿' },
  { symbol: 'USDT', name: 'Tether USD', balance: 10000.50, logo: '💵' },
  { symbol: 'QRDX', name: 'QRDX Token', balance: 5000.00, logo: '🔷' },
  { symbol: 'qBNB', name: 'Quantum Binance', balance: 15.32, logo: '💛' },
]

export function SwapInterface() {
  const [fromToken, setFromToken] = useState(tokens[0])
  const [toToken, setToToken] = useState(tokens[2])
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [activeTab, setActiveTab] = useState('swap')
  
  const handleSwapTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setFromAmount(toAmount)
    setToAmount(fromAmount)
  }
  
  const calculateToAmount = (amount: string) => {
    if (!amount) return ''
    const rate = 2845.32 // Mock exchange rate
    const value = parseFloat(amount)
    return (value * rate).toFixed(2)
  }
  
  const handleFromAmountChange = (value: string) => {
    setFromAmount(value)
    setToAmount(calculateToAmount(value))
  }
  
  const handleSwap = () => {
    // Simulate swap transaction
    console.log('Swapping', fromAmount, fromToken.symbol, 'to', toToken.symbol)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="swap">Swap</TabsTrigger>
              <TabsTrigger value="limit">Limit</TabsTrigger>
            </TabsList>
            
            <TabsContent value="swap" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">You pay</h3>
                <button className="text-xs text-primary hover:underline">
                  Balance: {fromToken.balance.toFixed(4)}
                </button>
              </div>
              
              <div className="relative">
                <div className="flex gap-2 p-4 rounded-xl bg-accent/50 border-2 border-accent hover:border-primary/50 transition-colors">
                  <input
                    type="number"
                    value={fromAmount}
                    onChange={(e) => handleFromAmountChange(e.target.value)}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-2xl font-semibold outline-none"
                  />
                  <Select value={fromToken.symbol} onValueChange={(value) => {
                    const token = tokens.find(t => t.symbol === value)
                    if (token) setFromToken(token)
                  }}>
                    <SelectTrigger className="w-[140px] border-0 bg-background/50">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{fromToken.logo}</span>
                          <span className="font-semibold">{fromToken.symbol}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {tokens.map((token) => (
                        <SelectItem key={token.symbol} value={token.symbol}>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{token.logo}</span>
                            <div>
                              <div className="font-semibold">{token.symbol}</div>
                              <div className="text-xs text-muted-foreground">{token.name}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 z-10">
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-full bg-background border-4 border-background shadow-lg hover:scale-110 transition-transform"
                    onClick={handleSwapTokens}
                  >
                    <ArrowDownUp className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-muted-foreground">You receive</h3>
                  <button className="text-xs text-primary hover:underline">
                    Balance: {toToken.balance.toFixed(4)}
                  </button>
                </div>
                
                <div className="flex gap-2 p-4 rounded-xl bg-accent/50 border-2 border-accent hover:border-primary/50 transition-colors">
                  <input
                    type="number"
                    value={toAmount}
                    readOnly
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-2xl font-semibold outline-none"
                  />
                  <Select value={toToken.symbol} onValueChange={(value) => {
                    const token = tokens.find(t => t.symbol === value)
                    if (token) setToToken(token)
                  }}>
                    <SelectTrigger className="w-[140px] border-0 bg-background/50">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{toToken.logo}</span>
                          <span className="font-semibold">{toToken.symbol}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {tokens.map((token) => (
                        <SelectItem key={token.symbol} value={token.symbol}>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{token.logo}</span>
                            <div>
                              <div className="font-semibold">{token.symbol}</div>
                              <div className="text-xs text-muted-foreground">{token.name}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {fromAmount && (
                <motion.div
                  className="p-3 rounded-lg bg-accent/30 space-y-2 text-sm"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-medium">1 {fromToken.symbol} = 2,845.32 {toToken.symbol}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      Network fee
                    </span>
                    <span className="font-medium">~$0.42</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max slippage</span>
                    <span className="font-medium">{slippage}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t">
                    <span className="text-muted-foreground">Minimum received</span>
                    <span className="font-medium">{(parseFloat(toAmount) * 0.995).toFixed(2)} {toToken.symbol}</span>
                  </div>
                </motion.div>
              )}
              
              <Button 
                className="w-full h-12 text-lg font-semibold"
                size="lg"
                onClick={handleSwap}
                disabled={!fromAmount || parseFloat(fromAmount) <= 0}
              >
                {!fromAmount || parseFloat(fromAmount) <= 0 ? 'Enter amount' : 'Swap'}
              </Button>
              
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Info className="h-3 w-3" />
                <span>Protected by quantum-resistant cryptography</span>
              </div>
            </TabsContent>
            
            <TabsContent value="limit" className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Limit orders coming soon</p>
                <p className="text-xs mt-1">Set custom prices for your trades</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  )
}
