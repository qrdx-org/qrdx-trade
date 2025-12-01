'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'

interface Trade {
  id: string
  price: number
  amount: number
  time: string
  type: 'buy' | 'sell'
}

export function TradeHistory() {
  const [trades, setTrades] = useState<Trade[]>([])
  
  useEffect(() => {
    // Generate initial trades
    const generateTrade = (): Trade => {
      const basePrice = 2845
      const price = basePrice + (Math.random() - 0.5) * 100
      const amount = Math.random() * 2 + 0.01
      
      return {
        id: Math.random().toString(36).substr(2, 9),
        price: parseFloat(price.toFixed(2)),
        amount: parseFloat(amount.toFixed(4)),
        time: new Date().toLocaleTimeString(),
        type: Math.random() > 0.5 ? 'buy' : 'sell'
      }
    }
    
    // Initialize with some trades
    const initialTrades = Array.from({ length: 20 }, generateTrade)
    setTrades(initialTrades)
    
    // Add new trades periodically
    const interval = setInterval(() => {
      setTrades(prev => {
        const newTrade = generateTrade()
        const updated = [newTrade, ...prev]
        return updated.slice(0, 50)
      })
    }, 4000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div
      className="bg-card/50 backdrop-blur rounded-lg border h-[600px] flex flex-col"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="p-3 border-b flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Recent Trades</h3>
      </div>
      
      <div className="px-3 py-2 grid grid-cols-3 gap-2 text-[10px] font-medium text-muted-foreground border-b uppercase tracking-wide">
        <span>Price (USDT)</span>
        <span className="text-right">Amount (qETH)</span>
        <span className="text-right">Time</span>
      </div>
      
      <div className="flex-1 overflow-auto">
        {trades.map((trade) => (
          <motion.div
            key={trade.id}
            className="grid grid-cols-3 gap-2 px-3 py-1.5 text-xs hover:bg-accent/50 cursor-pointer transition-colors"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className={`font-mono font-medium ${trade.type === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
              {trade.price.toFixed(2)}
            </span>
            <span className="text-right font-mono">{trade.amount.toFixed(4)}</span>
            <span className="text-right text-muted-foreground text-xs">{trade.time}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
