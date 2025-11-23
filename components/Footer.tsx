'use client'

import React from 'react'
import Link from 'next/link'
import { Github, Twitter, MessageCircle } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold">QRDX Trade</h3>
            <p className="text-sm text-muted-foreground">
              Quantum-resistant decentralized exchange. Trade with post-quantum security.
            </p>
          </div>

          {/* Products */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Products</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                  Trade
                </Link>
              </li>
              <li>
                <Link href="https://qrdx.org/pools" className="text-muted-foreground hover:text-foreground transition-colors">
                  Pools
                </Link>
              </li>
              <li>
                <Link href="https://qrdx.org/stake" className="text-muted-foreground hover:text-foreground transition-colors">
                  Stake
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="https://docs.qrdx.org" className="text-muted-foreground hover:text-foreground transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="https://qrdx.org/whitepaper" className="text-muted-foreground hover:text-foreground transition-colors">
                  Whitepaper
                </Link>
              </li>
              <li>
                <Link href="https://github.com/qrdx-org" className="text-muted-foreground hover:text-foreground transition-colors">
                  GitHub
                </Link>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Community</h4>
            <div className="flex space-x-4">
              <Link href="https://twitter.com/qrdx_org" className="text-muted-foreground hover:text-foreground transition-colors">
                <Twitter className="h-5 w-5" />
              </Link>
              <Link href="https://github.com/qrdx-org" className="text-muted-foreground hover:text-foreground transition-colors">
                <Github className="h-5 w-5" />
              </Link>
              <Link href="https://discord.gg/qrdx" className="text-muted-foreground hover:text-foreground transition-colors">
                <MessageCircle className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} QRDX Foundation. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
