'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { TrendingUp, Droplets, Coins, BookOpen, ExternalLink, BarChart3, Sparkles, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { WalletConnect, WalletType } from '@/components/WalletConnect'
import { cn } from '@/lib/utils'

const Navigation = () => {
  const [walletType, setWalletType] = useState<WalletType>(null)
  
  const navItems = [
    { href: '/trade', label: 'Trade', icon: <TrendingUp className="h-4 w-4" /> },
    { href: '/pools', label: 'Pools', icon: <Droplets className="h-4 w-4" /> },
    { href: '/stake', label: 'Stake', icon: <Coins className="h-4 w-4" /> },
    { href: '/partner', label: 'Partner', icon: <Sparkles className="h-4 w-4" /> },
    { href: '/analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
  ]

  return (
    <motion.nav 
      className="fixed w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b z-50"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="container flex h-16 items-center px-4 mx-auto">
        <Link href="/" className="mr-8">
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">QRDX Trade</span>
          </motion.div>
        </Link>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
        
        <div className="flex items-center gap-3">
          {walletType && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3 w-3 text-green-500" />
              <span>Quantum-Safe</span>
            </div>
          )}
          <a
            href="https://qrdx.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span>Docs</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <ThemeToggle />
          <WalletConnect onConnect={setWalletType} />
        </div>
      </div>
    </motion.nav>
  )
}

export default Navigation
