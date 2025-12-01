'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Star, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface Token {
  symbol: string
  name: string
  balance: number
  logo: string
  price: number
  change24h: number
  isPopular?: boolean
}

interface TokenSelectorProps {
  tokens: Token[]
  selectedToken: Token
  onSelectToken: (token: Token) => void
  label?: string
}

export function TokenSelector({ tokens, selectedToken, onSelectToken, label }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTokens = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return tokens.filter(
      token =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query)
    )
  }, [tokens, searchQuery])

  const popularTokens = useMemo(
    () => tokens.filter(token => token.isPopular),
    [tokens]
  )

  const handleSelectToken = (token: Token) => {
    onSelectToken(token)
    setIsOpen(false)
    setSearchQuery('')
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-between h-12 px-4 bg-accent/50 hover:bg-accent border-0"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">{selectedToken.logo}</span>
          <div className="flex flex-col items-start">
            <span className="font-bold">{selectedToken.symbol}</span>
            {label && <span className="text-xs text-muted-foreground">{label}</span>}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ▼
        </motion.div>
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Modal */}
            <motion.div
              className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-lg shadow-2xl z-50 max-h-[500px] flex flex-col"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Search Header */}
              <div className="p-4 border-b sticky top-0 bg-card">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by name or symbol..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 bg-accent rounded-lg outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {/* Popular Tokens */}
              {!searchQuery && popularTokens.length > 0 && (
                <div className="p-4 border-b">
                  <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                    <Star className="h-3 w-3" />
                    Popular
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {popularTokens.map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => handleSelectToken(token)}
                        className="px-3 py-1.5 rounded-full bg-accent hover:bg-accent/70 text-sm font-medium flex items-center gap-1 transition-colors"
                      >
                        <span>{token.logo}</span>
                        <span>{token.symbol}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Token List */}
              <div className="flex-1 overflow-y-auto">
                {filteredTokens.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No tokens found
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredTokens.map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => handleSelectToken(token)}
                        className="w-full p-3 rounded-lg hover:bg-accent transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{token.logo}</span>
                          <div className="flex flex-col items-start">
                            <span className="font-bold">{token.symbol}</span>
                            <span className="text-xs text-muted-foreground">
                              {token.name}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-sm">
                            {token.balance.toFixed(4)}
                          </span>
                          <span
                            className={`text-xs flex items-center gap-1 ${
                              token.change24h >= 0
                                ? 'text-green-500'
                                : 'text-red-500'
                            }`}
                          >
                            <TrendingUp
                              className={`h-3 w-3 ${
                                token.change24h < 0 ? 'rotate-180' : ''
                              }`}
                            />
                            {Math.abs(token.change24h).toFixed(2)}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
