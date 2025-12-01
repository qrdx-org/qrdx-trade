'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OrderBookEntry {
  price: number
  amount: number
  total: number
}

export function OrderBook() {
  const [asks, setAsks] = useState<OrderBookEntry[]>([])
  const [bids, setBids] = useState<OrderBookEntry[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMinimized, setIsMinimized] = useState(true)
  
  useEffect(() => {
    // Generate initial order book
    const generateOrders = (basePrice: number, isBid: boolean) => {
      const orders: OrderBookEntry[] = []
      let total = 0
      
      for (let i = 0; i < 15; i++) {
        const priceOffset = (Math.random() * 50 + i * 2) * (isBid ? -1 : 1)
        const price = basePrice + priceOffset
        const amount = Math.random() * 5 + 0.1
        total += amount
        
        orders.push({
          price: parseFloat(price.toFixed(2)),
          amount: parseFloat(amount.toFixed(4)),
          total: parseFloat(total.toFixed(4))
        })
      }
      
      return isBid ? orders.sort((a, b) => b.price - a.price) : orders.sort((a, b) => a.price - b.price)
    }
    
    const updateOrders = () => {
      setAsks(generateOrders(2850, false))
      setBids(generateOrders(2845, true))
    }
    
    updateOrders()
    const interval = setInterval(updateOrders, 5000)
    
    return () => clearInterval(interval)
  }, [])

  const maxTotal = Math.max(
    ...asks.map(a => a.total),
    ...bids.map(b => b.total)
  )

  const spread = asks.length > 0 && bids.length > 0 
    ? ((asks[0].price - bids[0].price) / bids[0].price * 100).toFixed(2)
    : '0.00'

  const OrderRow = ({ order, type }: { order: OrderBookEntry; type: 'ask' | 'bid' }) => {
    const percentage = (order.total / maxTotal) * 100
    
    return (
      <motion.div
        className="relative grid grid-cols-3 gap-2 px-3 py-1 text-xs hover:bg-accent/50 cursor-pointer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className={`absolute inset-0 ${type === 'ask' ? 'bg-red-500/10' : 'bg-green-500/10'}`}
          style={{ width: `${percentage}%`, right: type === 'ask' ? 0 : 'auto', left: type === 'bid' ? 0 : 'auto' }}
        />
        <span className={`relative font-mono ${type === 'ask' ? 'text-red-500' : 'text-green-500'} font-medium`}>
          {order.price.toFixed(2)}
        </span>
        <span className="relative text-right font-mono">{order.amount.toFixed(4)}</span>
        <span className="relative text-right font-mono text-muted-foreground">{order.total.toFixed(4)}</span>
      </motion.div>
    )
  }

  if (isMinimized) {
    return (
      <motion.div
        className="bg-card/50 backdrop-blur rounded-lg border p-3 cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => setIsMinimized(false)}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Order Book</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
        {bids.length > 0 && asks.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Spread</span>
              <span className="font-mono text-green-500">{spread}%</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-red-500 font-mono">{asks[0].price.toFixed(2)}</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-green-500 font-mono">{bids[0].price.toFixed(2)}</span>
            </div>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      className="bg-card/50 backdrop-blur rounded-lg border h-full flex flex-col"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Order Book</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">Spread: <span className="text-green-500 font-mono">{spread}%</span></span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => setIsMinimized(true)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="px-3 py-2 grid grid-cols-3 gap-2 text-[10px] font-medium text-muted-foreground border-b uppercase tracking-wide">
        <span>Price (USDT)</span>
        <span className="text-right">Amount (qETH)</span>
        <span className="text-right">Total</span>
      </div>
      
      <div className="flex-1 overflow-auto">
        <AnimatePresence>
          {asks.slice(0, isExpanded ? 10 : 5).reverse().map((ask, idx) => (
            <OrderRow key={`ask-${idx}`} order={ask} type="ask" />
          ))}
        </AnimatePresence>
        
        <div className="px-3 py-2 bg-accent/30 font-mono text-lg font-bold text-center border-y">
          <span className="text-green-500">
            {bids.length > 0 ? bids[0].price.toFixed(2) : '2845.00'}
          </span>
        </div>
        
        <AnimatePresence>
          {bids.slice(0, isExpanded ? 10 : 5).map((bid, idx) => (
            <OrderRow key={`bid-${idx}`} order={bid} type="bid" />
          ))}
        </AnimatePresence>
      </div>
      
      {(asks.length > 5 || bids.length > 5) && (
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show more
              </>
            )}
          </Button>
        </div>
      )}
    </motion.div>
  )
}
