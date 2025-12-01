'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Flame } from 'lucide-react'

interface TickerItem {
  symbol: string
  name: string
  price: number
  change: number
  isHot?: boolean
  isSponsor?: boolean
}

const mockTickers: TickerItem[] = [
  { symbol: 'qETH', name: 'Quantum Ethereum', price: 2845.32, change: 4.32, isHot: true },
  { symbol: 'qBTC', name: 'Quantum Bitcoin', price: 45231.21, change: -2.15 },
  { symbol: 'QRDX', name: 'QRDX Token', price: 1.234, change: 15.67, isSponsor: true },
  { symbol: 'qBNB', name: 'Quantum Binance', price: 312.45, change: 3.21, isHot: true },
  { symbol: 'USDT', name: 'Tether USD', price: 1.00, change: 0.01 },
  { symbol: 'qSOL', name: 'Quantum Solana', price: 98.76, change: 8.45, isHot: true },
  { symbol: 'qADA', name: 'Quantum Cardano', price: 0.456, change: -1.23 },
  { symbol: 'qDOT', name: 'Quantum Polkadot', price: 7.89, change: 5.67, isSponsor: true },
  { symbol: 'qLINK', name: 'Quantum Chainlink', price: 12.34, change: 2.34 },
  { symbol: 'qUNI', name: 'Quantum Uniswap', price: 6.78, change: -0.89 },
]

export function TickerBar() {
  const [tickers, setTickers] = useState(mockTickers)

  useEffect(() => {
    // Simulate live price updates
    const interval = setInterval(() => {
      setTickers(prev => prev.map(ticker => ({
        ...ticker,
        price: ticker.price * (1 + (Math.random() - 0.5) * 0.01),
        change: ticker.change + (Math.random() - 0.5) * 0.5
      })))
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // Duplicate tickers for seamless loop
  const duplicatedTickers = [...tickers, ...tickers, ...tickers]

  return (
    <div className="w-full bg-accent/30 border-b overflow-hidden py-2">
      <motion.div
        className="flex gap-8"
        animate={{
          x: [0, '-33.33%'],
        }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: "loop",
            duration: 60,
            ease: "linear",
          },
        }}
      >
        {duplicatedTickers.map((ticker, index) => (
          <div
            key={`${ticker.symbol}-${index}`}
            className="flex items-center gap-2 px-4 py-1 rounded-lg bg-background/50 border whitespace-nowrap"
          >
            {ticker.isHot && (
              <Flame className="h-3 w-3 text-orange-500" />
            )}
            {ticker.isSponsor && (
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
            <span className="font-bold text-sm">{ticker.symbol}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">{ticker.name}</span>
            <span className="font-mono text-sm">${ticker.price.toFixed(2)}</span>
            <span className={`flex items-center gap-1 text-xs font-medium ${
              ticker.change >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {ticker.change >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(ticker.change).toFixed(2)}%
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
