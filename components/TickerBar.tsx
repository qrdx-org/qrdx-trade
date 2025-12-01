'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Flame, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface TickerItem {
  symbol?: string
  name: string
  price?: number
  change?: number
  isHot?: boolean
  isSponsor?: boolean
  sponsorUrl?: string
  slug?: string
}

const mockTickers: TickerItem[] = [
  { symbol: 'qETH', name: 'Quantum Ethereum', price: 2845.32, change: 4.32, isHot: true, slug: 'qeth' },
  { symbol: 'qBTC', name: 'Quantum Bitcoin', price: 45231.21, change: -2.15, slug: 'qbtc' },
  { name: 'TradingView Pro', isSponsor: true, sponsorUrl: 'https://tradingview.com' },
  { symbol: 'QRDX', name: 'QRDX Token', price: 1.234, change: 15.67, isSponsor: true, sponsorUrl: 'https://qrdx.org', slug: 'qrdx' },
  { symbol: 'qBNB', name: 'Quantum Binance', price: 312.45, change: 3.21, isHot: true, slug: 'qbnb' },
  { symbol: 'USDT', name: 'Tether USD', price: 1.00, change: 0.01, slug: 'usdt' },
  { name: 'CoinGecko API', isSponsor: true, sponsorUrl: 'https://coingecko.com' },
  { symbol: 'qSOL', name: 'Quantum Solana', price: 98.76, change: 8.45, isHot: true, slug: 'qsol' },
  { symbol: 'qADA', name: 'Quantum Cardano', price: 0.456, change: -1.23, slug: 'qada' },
  { name: 'Quantum Wallet', isSponsor: true, sponsorUrl: 'https://example.com' },
  { symbol: 'qDOT', name: 'Quantum Polkadot', price: 7.89, change: 5.67, slug: 'qdot' },
  { symbol: 'qLINK', name: 'Quantum Chainlink', price: 12.34, change: 2.34, slug: 'qlink' },
  { symbol: 'qUNI', name: 'Quantum Uniswap', price: 6.78, change: -0.89, slug: 'quni' },
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
        style={{ display: 'flex', gap: '2rem' }}
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
        {duplicatedTickers.map((ticker, index) => {
          const href = ticker.isSponsor && ticker.sponsorUrl 
            ? ticker.sponsorUrl 
            : `/trade/${ticker.slug || ticker.symbol?.toLowerCase()}`
          
          const isExternal = ticker.isSponsor && ticker.sponsorUrl
          const isPureSponsor = ticker.isSponsor && !ticker.price
          
          const TickerContent = (
            <div className="flex items-center gap-2 px-4 py-1 rounded-lg bg-background/50 border whitespace-nowrap hover:bg-background/80 transition-colors cursor-pointer">
              {ticker.isHot && (
                <Flame className="h-3 w-3 text-orange-500" />
              )}
              {ticker.isSponsor && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold">
                  AD
                </span>
              )}
              {ticker.symbol && (
                <span className="font-bold text-sm">{ticker.symbol}</span>
              )}
              <span className={`text-xs ${isPureSponsor ? 'font-medium' : 'text-muted-foreground'} ${ticker.symbol ? 'hidden sm:inline' : ''}`}>
                {ticker.name}
              </span>
              {ticker.price && (
                <>
                  <span className="font-mono text-sm">${ticker.price.toFixed(2)}</span>
                  <span className={`flex items-center gap-1 text-xs font-medium ${
                    ticker.change! >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {ticker.change! >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(ticker.change!).toFixed(2)}%
                  </span>
                </>
              )}
              {isExternal && (
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          )

          return isExternal ? (
            <a
              key={`${ticker.symbol || ticker.name}-${index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {TickerContent}
            </a>
          ) : (
            <Link
              key={`${ticker.symbol || ticker.name}-${index}`}
              href={href}
            >
              {TickerContent}
            </Link>
          )
        })}
      </motion.div>
    </div>
  )
}
