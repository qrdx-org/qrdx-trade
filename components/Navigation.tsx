'use client'

import React from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold">QRDX</span>
            <span className="text-sm font-medium text-muted-foreground">Trade</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-sm font-medium hover:text-primary transition-colors">
              Trade
            </Link>
            <Link href="https://qrdx.org/pools" className="text-sm font-medium hover:text-primary transition-colors">
              Pools
            </Link>
            <Link href="https://docs.qrdx.org" className="text-sm font-medium hover:text-primary transition-colors">
              Docs
            </Link>
          </div>

          {/* Right Side Actions */}
          <div className="hidden md:flex items-center space-x-4">
            <ThemeToggle />
            <Button>Connect Wallet</Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center space-x-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-4">
            <Link href="/" className="block text-sm font-medium hover:text-primary transition-colors">
              Trade
            </Link>
            <Link href="https://qrdx.org/pools" className="block text-sm font-medium hover:text-primary transition-colors">
              Pools
            </Link>
            <Link href="https://docs.qrdx.org" className="block text-sm font-medium hover:text-primary transition-colors">
              Docs
            </Link>
            <Button className="w-full">Connect Wallet</Button>
          </div>
        )}
      </div>
    </nav>
  )
}
