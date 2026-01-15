'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { useTrades } from '@/lib/api'

interface Trade {
  id: string
  price: number
  amount: number
  timestamp: number
  type: 'buy' | 'sell'
}

interface TradeHistoryProps {
  tokenAddress?: string
  basePrice?: number
}

export function TradeHistory({ tokenAddress, basePrice }: TradeHistoryProps) {
  // Fetch trades from API
  const { data: apiTrades } = useTrades(
    tokenAddress || 'default',
    basePrice,
    50,
    3000 // refresh every 3 seconds
  )
  
  // Format trades with time string
  const trades = apiTrades.map(trade => ({
    ...trade,
    time: new Date(trade.timestamp).toLocaleTimeString()
  }))

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
