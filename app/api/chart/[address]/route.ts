import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

interface ChartDataPoint {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Cache for maintaining some consistency in chart data
const chartCache = new Map<string, { data: ChartDataPoint[], basePrice: number, timestamp: number }>()

function generateChartData(
  address: string, 
  timeframe: string, 
  from: number, 
  to: number
): ChartDataPoint[] {
  const cacheKey = `${address}-${timeframe}`
  const now = Date.now()
  
  // Check cache (valid for 10 seconds)
  const cached = chartCache.get(cacheKey)
  if (cached && now - cached.timestamp < 10000) {
    return cached.data.filter(d => d.time >= from && d.time <= to)
  }
  
  // Determine interval in milliseconds based on timeframe
  let interval: number
  let points: number
  
  switch (timeframe) {
    case '1':
      interval = 60 * 1000 // 1 minute
      points = 1440 // 1 day of data
      break
    case '5':
      interval = 5 * 60 * 1000 // 5 minutes
      points = 288 // 1 day of data
      break
    case '15':
      interval = 15 * 60 * 1000 // 15 minutes
      points = 672 // 7 days of data
      break
    case '60':
      interval = 60 * 60 * 1000 // 1 hour
      points = 720 // 30 days of data
      break
    case '240':
      interval = 4 * 60 * 60 * 1000 // 4 hours
      points = 720 // 120 days of data
      break
    case 'D':
      interval = 24 * 60 * 60 * 1000 // 1 day
      points = 365 // 1 year of data
      break
    case 'W':
      interval = 7 * 24 * 60 * 60 * 1000 // 1 week
      points = 260 // 5 years of data
      break
    default:
      interval = 60 * 60 * 1000
      points = 720
  }
  
  // Generate consistent base price from address
  const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const basePrice = (hash % 5000) + 100
  
  const data: ChartDataPoint[] = []
  const endTime = to || now
  const startTime = from || (endTime - (points * interval))
  
  let currentPrice = basePrice * 0.85 // Start lower to show growth
  let currentTime = startTime
  
  // Generate trending data with some volatility
  while (currentTime <= endTime) {
    // Add trend component (generally upward)
    const trendFactor = 0.0002
    const volatility = basePrice * 0.01
    
    // Random walk with trend
    const change = (Math.random() - 0.45) * volatility + (basePrice * trendFactor)
    currentPrice = Math.max(currentPrice + change, basePrice * 0.5)
    
    const high = currentPrice * (1 + Math.random() * 0.02)
    const low = currentPrice * (1 - Math.random() * 0.02)
    const open = low + Math.random() * (high - low)
    const close = low + Math.random() * (high - low)
    
    data.push({
      time: Math.floor(currentTime / 1000), // Convert to seconds for TradingView
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.random() * 1000000 + 100000
    })
    
    currentTime += interval
  }
  
  // Cache the data
  chartCache.set(cacheKey, { data, basePrice, timestamp: now })
  
  return data
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  const searchParams = request.nextUrl.searchParams
  
  const timeframe = searchParams.get('timeframe') || '60'
  const from = parseInt(searchParams.get('from') || '0')
  const to = parseInt(searchParams.get('to') || Date.now().toString())
  
  const data = generateChartData(address, timeframe, from, to)
  
  return NextResponse.json({
    address,
    timeframe,
    data
  })
}
