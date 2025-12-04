'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Wallet, ChevronDown, Copy, ExternalLink, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getActiveWalletAddress } from '@/lib/walletStore'

export type WalletType = 'web3' | 'qrdx' | null

interface WalletConnectProps {
  onConnect: (type: WalletType) => void
}

export function WalletConnect({ onConnect }: WalletConnectProps) {
  const router = useRouter()
  const [isConnected, setIsConnected] = useState(false)
  const [walletType, setWalletType] = useState<WalletType>(null)
  const [address, setAddress] = useState('')
  const [copied, setCopied] = useState(false)
  
  // Check for connected wallets on mount
  useEffect(() => {
    const checkWallets = () => {
      const activeWallet = getActiveWalletAddress()
      
      if (activeWallet) {
        setWalletType(activeWallet.type)
        setAddress(activeWallet.address)
        setIsConnected(true)
        onConnect(activeWallet.type)
      } else {
        setIsConnected(false)
        setWalletType(null)
        setAddress('')
        onConnect(null)
      }
    }
    
    checkWallets()
    
    // Listen for storage changes
    const handleStorageChange = () => checkWallets()
    window.addEventListener('storage', handleStorageChange)
    
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [onConnect])
  
  const handleConnectClick = () => {
    router.push('/wallets')
  }
  
  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  if (isConnected) {
    return (
      <motion.div
        className="flex items-center gap-2"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent border cursor-pointer hover:bg-accent/80 transition-colors" onClick={() => router.push('/wallets')}>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">
              {walletType === 'web3' ? 'Web3' : 'QRDX'}
            </span>
          </div>
          <span className="text-sm font-mono text-muted-foreground">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              copyAddress()
            }}
            className="p-1 hover:bg-accent-foreground/10 rounded transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </motion.div>
    )
  }
  
  return (
    <Button onClick={handleConnectClick} className="gap-2">
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </Button>
  )
}
