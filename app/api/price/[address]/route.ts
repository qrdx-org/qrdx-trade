import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// Mock price generator with some consistency
const priceCache = new Map<string, { price: number, lastUpdate: number }>()

function generatePrice(address: string, basePrice?: number): number {
  const cached = priceCache.get(address)
  const now = Date.now()
  
  // If we have a recent price (within 5 seconds), use it with small variation
  if (cached && now - cached.lastUpdate < 5000) {
    const variation = (Math.random() - 0.5) * 0.005 // 0.5% max variation
    const newPrice = cached.price * (1 + variation)
    priceCache.set(address, { price: newPrice, lastUpdate: now })
    return newPrice
  }
  
  // Generate new base price if not provided
  if (!basePrice) {
    // Use address hash to generate consistent base prices for the same address
    const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    basePrice = (hash % 5000) + 100
  }
  
  const newPrice = basePrice * (0.9 + Math.random() * 0.2)
  priceCache.set(address, { price: newPrice, lastUpdate: now })
  return newPrice
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  
  // Handle native tokens
  const isNative = address === 'native' || address.toLowerCase() === 'eth' || address.toLowerCase() === 'bnb'
  
  const currentPrice = generatePrice(address)
  const priceChange24h = (Math.random() - 0.4) * 20 // Bias towards positive
  
  return NextResponse.json({
    address: isNative ? 'native' : address,
    price: currentPrice,
    priceChange24h,
    volume24h: Math.random() * 10000000 + 100000,
    marketCap: currentPrice * (Math.random() * 100000000 + 10000000),
    high24h: currentPrice * 1.05,
    low24h: currentPrice * 0.95,
    lastUpdate: Date.now()
  })
}
