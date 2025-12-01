'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface TradingInterfaceProps {
  tokenSymbol: string
  currentPrice: number
  onOrderPriceChange?: (orderType: 'buy' | 'sell', price: number | null) => void
}

export function TradingInterface({ tokenSymbol, currentPrice, onOrderPriceChange }: TradingInterfaceProps) {
  const [activeTab, setActiveTab] = useState<'spot' | 'limit' | 'stop'>('spot')
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState(currentPrice.toString())
  const [stopPrice, setStopPrice] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [percentage, setPercentage] = useState(0)

  // Notify parent when price changes in limit/stop-limit orders
  useEffect(() => {
    if (activeTab !== 'spot' && onOrderPriceChange) {
      const priceNum = parseFloat(price)
      if (!isNaN(priceNum) && priceNum > 0) {
        onOrderPriceChange(orderSide, priceNum)
      } else {
        onOrderPriceChange(orderSide, null)
      }
    } else if (activeTab === 'spot' && onOrderPriceChange) {
      // Clear line when switching to spot
      onOrderPriceChange(orderSide, null)
    }
  }, [price, activeTab, orderSide, onOrderPriceChange])

  // Stub balance data - would come from API
  const usdtBalance = 10000.50
  const tokenBalance = 2.5432

  const calculateTotal = () => {
    const amt = parseFloat(amount) || 0
    const prc = parseFloat(price) || currentPrice
    return (amt * prc).toFixed(2)
  }

  const setPercentageAmount = (pct: number) => {
    setPercentage(pct)
    if (orderSide === 'buy') {
      const maxAmount = usdtBalance / (parseFloat(price) || currentPrice)
      setAmount(((maxAmount * pct) / 100).toFixed(6))
    } else {
      setAmount(((tokenBalance * pct) / 100).toFixed(6))
    }
  }

  return (
    <Card className="border-0 bg-card/50 backdrop-blur">
      <CardContent className="p-4">
        {/* Buy/Sell Toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Button
            variant={orderSide === 'buy' ? 'default' : 'outline'}
            className={`h-10 font-bold ${orderSide === 'buy' ? 'bg-green-600 hover:bg-green-700' : ''}`}
            onClick={() => setOrderSide('buy')}
          >
            Buy
          </Button>
          <Button
            variant={orderSide === 'sell' ? 'default' : 'outline'}
            className={`h-10 font-bold ${orderSide === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}`}
            onClick={() => setOrderSide('sell')}
          >
            Sell
          </Button>
        </div>

        {/* Order Type Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mb-4">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="spot" className="text-xs">Spot</TabsTrigger>
            <TabsTrigger value="limit" className="text-xs">Limit</TabsTrigger>
            <TabsTrigger value="stop" className="text-xs">Stop-Limit</TabsTrigger>
          </TabsList>

          <TabsContent value="spot" className="space-y-3 mt-4">
            {/* Price (Market) */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Price</label>
              <Input
                value="Market"
                disabled
                className="h-9 bg-accent text-center font-medium"
              />
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Amount</label>
                <span className="text-xs text-muted-foreground">
                  Avbl: {orderSide === 'buy' ? usdtBalance.toFixed(2) : tokenBalance.toFixed(6)} {orderSide === 'buy' ? 'USDT' : tokenSymbol}
                </span>
              </div>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>

            {/* Percentage Selector */}
            <div className="grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((pct) => (
                <Button
                  key={pct}
                  variant="outline"
                  size="sm"
                  className={`h-7 text-xs ${percentage === pct ? 'bg-primary text-primary-foreground' : ''}`}
                  onClick={() => setPercentageAmount(pct)}
                >
                  {pct}%
                </Button>
              ))}
            </div>

            {/* Total */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Total</label>
              <Input
                value={calculateTotal()}
                disabled
                className="h-9 bg-accent font-mono"
              />
            </div>

            {/* Submit Button */}
            <Button
              className={`w-full h-10 font-bold ${
                orderSide === 'buy' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {orderSide === 'buy' ? 'Buy' : 'Sell'} {tokenSymbol}
            </Button>
          </TabsContent>

          <TabsContent value="limit" className="space-y-3 mt-4">
            {/* Price */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Price</label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="h-9 font-mono"
              />
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Amount</label>
                <span className="text-xs text-muted-foreground">
                  Avbl: {orderSide === 'buy' ? usdtBalance.toFixed(2) : tokenBalance.toFixed(6)} {orderSide === 'buy' ? 'USDT' : tokenSymbol}
                </span>
              </div>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>

            {/* Percentage Selector */}
            <div className="grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((pct) => (
                <Button
                  key={pct}
                  variant="outline"
                  size="sm"
                  className={`h-7 text-xs ${percentage === pct ? 'bg-primary text-primary-foreground' : ''}`}
                  onClick={() => setPercentageAmount(pct)}
                >
                  {pct}%
                </Button>
              ))}
            </div>

            {/* Total */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Total</label>
              <Input
                value={calculateTotal()}
                disabled
                className="h-9 bg-accent font-mono"
              />
            </div>

            {/* Submit Button */}
            <Button
              className={`w-full h-10 font-bold ${
                orderSide === 'buy' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {orderSide === 'buy' ? 'Buy' : 'Sell'} {tokenSymbol}
            </Button>
          </TabsContent>

          <TabsContent value="stop" className="space-y-3 mt-4">
            {/* Stop Price */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Stop Price</label>
              <Input
                type="number"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                placeholder="0.00"
                className="h-9 font-mono"
              />
            </div>

            {/* Limit Price */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Limit Price</label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="h-9 font-mono"
              />
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Amount</label>
                <span className="text-xs text-muted-foreground">
                  Avbl: {orderSide === 'buy' ? usdtBalance.toFixed(2) : tokenBalance.toFixed(6)} {orderSide === 'buy' ? 'USDT' : tokenSymbol}
                </span>
              </div>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>

            {/* TP/SL */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Take Profit</label>
                <Input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="Optional"
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Stop Loss</label>
                <Input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="Optional"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              className={`w-full h-10 font-bold ${
                orderSide === 'buy' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {orderSide === 'buy' ? 'Buy' : 'Sell'} {tokenSymbol}
            </Button>
          </TabsContent>
        </Tabs>

        {/* Balance Info */}
        <div className="pt-3 border-t space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">USDT Balance</span>
            <span className="font-mono">{usdtBalance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{tokenSymbol} Balance</span>
            <span className="font-mono">{tokenBalance.toFixed(6)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
