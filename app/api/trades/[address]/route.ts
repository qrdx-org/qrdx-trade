import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

interface Trade {
  id: string
  price: number
  amount: number
  timestamp: number
  type: 'buy' | 'sell'
}

// Cache for maintaining trade history
const tradesCache = new Map<string, { trades: Trade[], lastId: number }>()

function generateTrades(address: string, basePrice: number, limit: number = 50): Trade[] {
  const cached = tradesCache.get(address)
  const now = Date.now()
  
  // Initialize cache if doesn't exist
  if (!cached) {
    const initialTrades: Trade[] = []
    
    for (let i = 0; i < limit; i++) {
      const price = basePrice + (Math.random() - 0.5) * (basePrice * 0.05)
      const amount = Math.random() * 2 + 0.01
      const timestamp = now - (limit - i) * 5000 // 5 seconds apart
      
      initialTrades.push({
        id: `${address}-${i}`,
        price: parseFloat(price.toFixed(2)),
        amount: parseFloat(amount.toFixed(4)),
        timestamp,
        type: Math.random() > 0.5 ? 'buy' : 'sell'
      })
    }
    
    tradesCache.set(address, { trades: initialTrades, lastId: limit })
    return initialTrades
  }
  
  // Add new trade if enough time passed (simulate periodic trades)
  const lastTrade = cached.trades[cached.trades.length - 1]
  if (now - lastTrade.timestamp > 3000) {
    const price = basePrice + (Math.random() - 0.5) * (basePrice * 0.05)
    const amount = Math.random() * 2 + 0.01
    
    const newTrade: Trade = {
      id: `${address}-${cached.lastId}`,
      price: parseFloat(price.toFixed(2)),
      amount: parseFloat(amount.toFixed(4)),
      timestamp: now,
      type: Math.random() > 0.5 ? 'buy' : 'sell'
    }
    
    cached.trades.push(newTrade)
    cached.lastId++
    
    // Keep only last 100 trades
    if (cached.trades.length > 100) {
      cached.trades.shift()
    }
  }
  
  return cached.trades.slice(-limit)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  const searchParams = request.nextUrl.searchParams
  
  const limit = parseInt(searchParams.get('limit') || '50')
  const basePrice = parseFloat(searchParams.get('price') || '') || 
    ((address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 5000) + 100)
  
  const trades = generateTrades(address, basePrice, limit)
  
  return NextResponse.json({
    address,
    trades
  })
}
