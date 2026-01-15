import { NextResponse } from 'next/server'

export const runtime = 'edge'

// Global stats cache
let statsCache: any = null
let lastUpdate = 0

function generateStats() {
  const now = Date.now()
  
  // Return cached if less than 5 seconds old
  if (statsCache && now - lastUpdate < 5000) {
    // Add small variations to make it look live
    return {
      ...statsCache,
      volume24h: statsCache.volume24h * (0.99 + Math.random() * 0.02),
      activeUsers: Math.floor(statsCache.activeUsers * (0.98 + Math.random() * 0.04)),
      totalTrades: statsCache.totalTrades + Math.floor(Math.random() * 10)
    }
  }
  
  // Generate fresh stats
  statsCache = {
    tvl: 2400000000 + Math.random() * 100000000,
    volume24h: 847000000 + Math.random() * 50000000,
    activeUsers: 156000 + Math.floor(Math.random() * 5000),
    liquidityPools: 2847 + Math.floor(Math.random() * 50),
    totalTrades: 1200000 + Math.floor(Math.random() * 10000),
    avgAPY: 24.5 + (Math.random() - 0.5) * 2,
    tvlChange24h: 12.3 + (Math.random() - 0.5) * 3,
    volumeChange24h: 8.7 + (Math.random() - 0.5) * 4,
    usersChange24h: 15.2 + (Math.random() - 0.5) * 5,
    lastUpdate: now
  }
  
  lastUpdate = now
  return statsCache
}

export async function GET() {
  const stats = generateStats()
  
  return NextResponse.json(stats)
}
