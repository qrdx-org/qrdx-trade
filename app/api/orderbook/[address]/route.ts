import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

interface OrderBookEntry {
  price: number
  amount: number
  total: number
}

interface OrderBook {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread: number
  lastUpdate: number
}

// Cache for maintaining some consistency
const orderbookCache = new Map<string, { data: OrderBook, timestamp: number }>()

function generateOrderBook(address: string, basePrice: number): OrderBook {
  const cached = orderbookCache.get(address)
  const now = Date.now()
  
  // Return cached data if less than 2 seconds old
  if (cached && now - cached.timestamp < 2000) {
    return cached.data
  }
  
  const bids: OrderBookEntry[] = []
  const asks: OrderBookEntry[] = []
  
  let bidTotal = 0
  let askTotal = 0
  
  // Generate 15 levels for each side
  for (let i = 0; i < 15; i++) {
    // Bids (buy orders) - decreasing prices
    const bidPriceOffset = (i * 2) + Math.random() * 5
    const bidPrice = basePrice - bidPriceOffset
    const bidAmount = Math.random() * 5 + 0.1
    bidTotal += bidAmount
    
    bids.push({
      price: parseFloat(bidPrice.toFixed(2)),
      amount: parseFloat(bidAmount.toFixed(4)),
      total: parseFloat(bidTotal.toFixed(4))
    })
    
    // Asks (sell orders) - increasing prices
    const askPriceOffset = (i * 2) + Math.random() * 5
    const askPrice = basePrice + askPriceOffset
    const askAmount = Math.random() * 5 + 0.1
    askTotal += askAmount
    
    asks.push({
      price: parseFloat(askPrice.toFixed(2)),
      amount: parseFloat(askAmount.toFixed(4)),
      total: parseFloat(askTotal.toFixed(4))
    })
  }
  
  // Sort properly
  bids.sort((a, b) => b.price - a.price)
  asks.sort((a, b) => a.price - b.price)
  
  const spread = ((asks[0].price - bids[0].price) / bids[0].price) * 100
  
  const orderbook = {
    bids,
    asks,
    spread: parseFloat(spread.toFixed(2)),
    lastUpdate: now
  }
  
  orderbookCache.set(address, { data: orderbook, timestamp: now })
  
  return orderbook
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  const searchParams = request.nextUrl.searchParams
  
  // Get base price from query or generate consistent one
  const basePrice = parseFloat(searchParams.get('price') || '') || 
    ((address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 5000) + 100)
  
  const orderbook = generateOrderBook(address, basePrice)
  
  return NextResponse.json({
    address,
    ...orderbook
  })
}
