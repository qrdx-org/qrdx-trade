'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownUp, Settings, Info, TrendingUp, Zap, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TokenSelector, Token } from '@/components/TokenSelector'

const tokens: Token[] = [
  { symbol: 'qETH', name: 'Quantum Ethereum', balance: 2.5432, logo: '💎', price: 2845.32, change24h: 4.32, isPopular: true },
  { symbol: 'qBTC', name: 'Quantum Bitcoin', balance: 0.1234, logo: '₿', price: 45231.21, change24h: -2.15, isPopular: true },
  { symbol: 'USDT', name: 'Tether USD', balance: 10000.50, logo: '💵', price: 1.00, change24h: 0.01, isPopular: true },
  { symbol: 'QRDX', name: 'QRDX Token', balance: 5000.00, logo: '🔷', price: 1.234, change24h: 15.67, isPopular: true },
  { symbol: 'qBNB', name: 'Quantum Binance', balance: 15.32, logo: '💛', price: 312.45, change24h: 3.21, isPopular: true },
  { symbol: 'qSOL', name: 'Quantum Solana', balance: 8.76, logo: '☀️', price: 98.76, change24h: 8.45 },
  { symbol: 'qADA', name: 'Quantum Cardano', balance: 1234.56, logo: '🔵', price: 0.456, change24h: -1.23 },
  { symbol: 'qDOT', name: 'Quantum Polkadot', balance: 45.67, logo: '🟣', price: 7.89, change24h: 5.67 },
  { symbol: 'qLINK', name: 'Quantum Chainlink', balance: 89.12, logo: '🔗', price: 12.34, change24h: 2.34 },
  { symbol: 'qUNI', name: 'Quantum Uniswap', balance: 123.45, logo: '🦄', price: 6.78, change24h: -0.89 },
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
    const rate = fromToken.price / toToken.price
    const value = parseFloat(amount)
    return (value * rate).toFixed(6)
  }
  
  const handleFromAmountChange = (value: string) => {
    setFromAmount(value)
    setToAmount(calculateToAmount(value))
  }
  
  const handleSwap = () => {
    // Simulate swap transaction
    console.log('Swapping', fromAmount, fromToken.symbol, 'to', toToken.symbol)
  }

  const usdValue = fromAmount ? (parseFloat(fromAmount) * fromToken.price).toFixed(2) : '0.00'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <Card className="border-0 shadow-lg bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between mb-6">
              <TabsList className="grid w-[200px] grid-cols-2 h-10">
                <TabsTrigger value="swap" className="font-semibold">Swap</TabsTrigger>
                <TabsTrigger value="limit" className="font-semibold">Limit</TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
            
            <TabsContent value="swap" className="space-y-3 mt-0">
            {/* From Token */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-medium text-muted-foreground">You pay</span>
                <button 
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setFromAmount(fromToken.balance.toString())}
                >
                  Balance: {fromToken.balance.toFixed(4)}
                </button>
              </div>
              
              <div className="relative p-4 rounded-2xl bg-accent/30 border-2 border-transparent hover:border-primary/20 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <input
                    type="number"
                    value={fromAmount}
                    onChange={(e) => handleFromAmountChange(e.target.value)}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-3xl font-bold outline-none w-full"
                  />
                  <TokenSelector
                    tokens={tokens}
                    selectedToken={fromToken}
                    onSelectToken={setFromToken}
                  />
                </div>
                {fromAmount && (
                  <div className="text-sm text-muted-foreground">
                    ≈ ${usdValue} USD
                  </div>
                )}
              </div>
            </div>
            
            {/* Swap Button */}
            <div className="flex justify-center -my-2 relative z-10">
              <Button
                size="icon"
                variant="outline"
                className="rounded-xl bg-background border-2 hover:bg-accent hover:scale-110 hover:rotate-180 transition-all duration-300 h-10 w-10"
                onClick={handleSwapTokens}
              >
                <ArrowDownUp className="h-5 w-5" />
              </Button>
            </div>
            
            {/* To Token */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-medium text-muted-foreground">You receive</span>
                <span className="text-xs text-muted-foreground">
                  Balance: {toToken.balance.toFixed(4)}
                </span>
              </div>
              
              <div className="relative p-4 rounded-2xl bg-accent/30 border-2 border-transparent hover:border-primary/20 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <input
                    type="text"
                    value={toAmount}
                    readOnly
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-3xl font-bold outline-none w-full"
                  />
                  <TokenSelector
                    tokens={tokens}
                    selectedToken={toToken}
                    onSelectToken={setToToken}
                  />
                </div>
                {toAmount && parseFloat(toAmount) > 0 && (
                  <div className="text-sm text-muted-foreground">
                    ≈ ${(parseFloat(toAmount) * toToken.price).toFixed(2)} USD
                  </div>
                )}
              </div>
            </div>
            
            {/* Trade Details */}
            {fromAmount && parseFloat(fromAmount) > 0 && (
              <motion.div
                className="p-4 rounded-xl bg-accent/20 space-y-2.5"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rate</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      1 {fromToken.symbol} = {(fromToken.price / toToken.price).toFixed(4)} {toToken.symbol}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Network fee
                  </span>
                  <span className="font-medium text-green-500">~$0.42</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Max slippage</span>
                  <span className="font-medium">{slippage}%</span>
                </div>
                
                <div className="pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Minimum received</span>
                    <span className="font-medium">
                      {(parseFloat(toAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {toToken.symbol}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Swap Button */}
            <Button 
              className="w-full h-14 text-base font-bold rounded-xl"
              size="lg"
              onClick={handleSwap}
              disabled={!fromAmount || parseFloat(fromAmount) <= 0}
            >
              {!fromAmount || parseFloat(fromAmount) <= 0 
                ? 'Enter an amount' 
                : `Swap ${fromToken.symbol} for ${toToken.symbol}`
              }
            </Button>
            
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
              <Info className="h-3 w-3" />
              <span>Protected by quantum-resistant cryptography</span>
            </div>
          </TabsContent>
          
          <TabsContent value="limit" className="space-y-4 mt-0">
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-base font-medium mb-1">Limit orders coming soon</p>
              <p className="text-sm">Set custom prices for your trades</p>
            </div>
          </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  )
}
