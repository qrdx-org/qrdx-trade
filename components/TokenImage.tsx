'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface TokenImageProps {
  symbol: string
  address: string
  isNative?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12'
}

export function TokenImage({ 
  symbol, 
  address, 
  isNative = false, 
  size = 'md',
  className 
}: TokenImageProps) {
  const [error, setError] = useState(false)
  const [useSvg, setUseSvg] = useState(false)
  
  // Get image URL based on whether it's a native token or contract
  const getImageUrl = () => {
    if (isNative || address === 'native') {
      // Use SVG if PNG failed and SVG exists
      if (useSvg) {
        return `/tokens/${symbol.toLowerCase()}.svg`
      }
      return `/tokens/${symbol.toLowerCase()}.png`
    }
    return `https://explorer.qrdx.org/contracts/${address}/image`
  }

  // Fallback to a placeholder if image fails to load
  const handleError = () => {
    // For native tokens, try SVG if PNG fails
    if ((isNative || address === 'native') && !useSvg) {
      setUseSvg(true)
    } else {
      setError(true)
    }
  }

  if (error) {
    // Fallback to a simple colored circle with the first letter
    return (
      <div 
        className={cn(
          sizeClasses[size],
          'rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold',
          className
        )}
      >
        <span className={cn(
          size === 'sm' && 'text-xs',
          size === 'md' && 'text-sm',
          size === 'lg' && 'text-base',
          size === 'xl' && 'text-lg'
        )}>
          {symbol.charAt(0)}
        </span>
      </div>
    )
  }

  return (
    <Image
      src={getImageUrl()}
      alt={symbol}
      width={size === 'sm' ? 20 : size === 'md' ? 32 : size === 'lg' ? 40 : 48}
      height={size === 'sm' ? 20 : size === 'md' ? 32 : size === 'lg' ? 40 : 48}
      className={cn(sizeClasses[size], 'rounded-full', className)}
      onError={handleError}
      unoptimized // Allow loading from external domains
    />
  )
}
