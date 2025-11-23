'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, ChevronDown, Copy, ExternalLink, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type WalletType = 'web3' | 'qrdx' | null

interface WalletConnectProps {
  onConnect: (type: WalletType) => void
}

export function WalletConnect({ onConnect }: WalletConnectProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [walletType, setWalletType] = useState<WalletType>(null)
  const [address, setAddress] = useState('')
  const [copied, setCopied] = useState(false)
  
  const handleConnect = (type: WalletType) => {
    // Simulate wallet connection
    const mockAddress = type === 'web3' 
      ? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      : 'qrdx1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0'
    
    setWalletType(type)
    setAddress(mockAddress)
    setIsConnected(true)
    onConnect(type)
  }
  
  const handleDisconnect = () => {
    setIsConnected(false)
    setWalletType(null)
    setAddress('')
    onConnect(null)
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
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent border">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">
              {walletType === 'web3' ? 'Web3 Wallet' : 'QRDX Wallet'}
            </span>
          </div>
          <span className="text-sm font-mono text-muted-foreground">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <button
            onClick={copyAddress}
            className="p-1 hover:bg-accent-foreground/10 rounded transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </motion.div>
    )
  }
  
  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={(value) => handleConnect(value as WalletType)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Connect Wallet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="web3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              Web3 Wallet
            </div>
          </SelectItem>
          <SelectItem value="qrdx">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-500" />
              QRDX Wallet
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
