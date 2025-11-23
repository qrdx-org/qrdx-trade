'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface OrderBookEntry {
  price: number
  amount: number
  total: number
}

export function OrderBook() {
  const [asks, setAsks] = useState<OrderBookEntry[]>([])
  const [bids, setBids] = useState<OrderBookEntry[]>([])
  
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

  const OrderRow = ({ order, type }: { order: OrderBookEntry; type: 'ask' | 'bid' }) => {
    const percentage = (order.total / maxTotal) * 100
    
    return (
      <motion.div
        className="relative grid grid-cols-3 gap-2 px-3 py-1 text-sm hover:bg-accent/50 cursor-pointer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className={`absolute inset-0 ${type === 'ask' ? 'bg-red-500/10' : 'bg-green-500/10'}`}
          style={{ width: `${percentage}%`, right: type === 'ask' ? 0 : 'auto', left: type === 'bid' ? 0 : 'auto' }}
        />
        <span className={`relative font-mono ${type === 'ask' ? 'text-red-500' : 'text-green-500'}`}>
          {order.price.toFixed(2)}
        </span>
        <span className="relative text-right font-mono">{order.amount.toFixed(4)}</span>
        <span className="relative text-right font-mono text-muted-foreground">{order.total.toFixed(4)}</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="bg-card rounded-lg border h-full flex flex-col"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="p-4 border-b">
        <h3 className="font-semibold">Order Book</h3>
      </div>
      
      <div className="px-3 py-2 grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground border-b">
        <span>Price (USDT)</span>
        <span className="text-right">Amount (qETH)</span>
        <span className="text-right">Total</span>
      </div>
      
      <div className="flex-1 overflow-auto">
        <AnimatePresence>
          {asks.slice(0, 10).reverse().map((ask, idx) => (
            <OrderRow key={`ask-${idx}`} order={ask} type="ask" />
          ))}
        </AnimatePresence>
        
        <div className="px-3 py-2 bg-accent/30 font-mono text-lg font-bold text-center">
          {bids.length > 0 ? bids[0].price.toFixed(2) : '2845.00'}
        </div>
        
        <AnimatePresence>
          {bids.slice(0, 10).map((bid, idx) => (
            <OrderRow key={`bid-${idx}`} order={bid} type="bid" />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
