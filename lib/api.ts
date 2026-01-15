'use client'

import { useState, useEffect, useCallback } from 'react'

export interface PriceData {
  address: string
  price: number
  priceChange24h: number
  volume24h: number
  marketCap: number
  high24h: number
  low24h: number
  lastUpdate: number
}

export interface ChartDataPoint {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderBookEntry {
  price: number
  amount: number
  total: number
}

export interface OrderBookData {
  address: string
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread: number
  lastUpdate: number
}

export interface Trade {
  id: string
  price: number
  amount: number
  timestamp: number
  type: 'buy' | 'sell'
}

export interface MarketStats {
  tvl: number
  volume24h: number
  activeUsers: number
  liquidityPools: number
  totalTrades: number
  avgAPY: number
  tvlChange24h: number
  volumeChange24h: number
  usersChange24h: number
  lastUpdate: number
}

/**
 * Hook to fetch current price data for a token
 */
export function usePrice(address: string | null, refreshInterval: number = 5000) {
  const [data, setData] = useState<PriceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchPrice = useCallback(async () => {
    if (!address) return

    try {
      const response = await fetch(`/api/price/${address}`)
      if (!response.ok) throw new Error('Failed to fetch price')
      const priceData = await response.json()
      setData(priceData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchPrice()
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchPrice, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchPrice, refreshInterval])

  return { data, loading, error, refetch: fetchPrice }
}

/**
 * Hook to fetch chart data for a token
 */
export function useChartData(
  address: string | null,
  timeframe: string = '60',
  from?: number,
  to?: number
) {
  const [data, setData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchChartData = useCallback(async () => {
    if (!address) return

    try {
      const params = new URLSearchParams({ timeframe })
      if (from) params.append('from', from.toString())
      if (to) params.append('to', to.toString())

      const response = await fetch(`/api/chart/${address}?${params}`)
      if (!response.ok) throw new Error('Failed to fetch chart data')
      const chartData = await response.json()
      setData(chartData.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [address, timeframe, from, to])

  useEffect(() => {
    fetchChartData()
  }, [fetchChartData])

  return { data, loading, error, refetch: fetchChartData }
}

/**
 * Hook to fetch order book data for a token
 */
export function useOrderBook(
  address: string | null,
  basePrice?: number,
  refreshInterval: number = 2000
) {
  const [data, setData] = useState<OrderBookData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchOrderBook = useCallback(async () => {
    if (!address) return

    try {
      const params = new URLSearchParams()
      if (basePrice) params.append('price', basePrice.toString())

      const response = await fetch(`/api/orderbook/${address}?${params}`)
      if (!response.ok) throw new Error('Failed to fetch order book')
      const orderBookData = await response.json()
      setData(orderBookData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [address, basePrice])

  useEffect(() => {
    fetchOrderBook()
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchOrderBook, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchOrderBook, refreshInterval])

  return { data, loading, error, refetch: fetchOrderBook }
}

/**
 * Hook to fetch recent trades for a token
 */
export function useTrades(
  address: string | null,
  basePrice?: number,
  limit: number = 50,
  refreshInterval: number = 3000
) {
  const [data, setData] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchTrades = useCallback(async () => {
    if (!address) return

    try {
      const params = new URLSearchParams({ limit: limit.toString() })
      if (basePrice) params.append('price', basePrice.toString())

      const response = await fetch(`/api/trades/${address}?${params}`)
      if (!response.ok) throw new Error('Failed to fetch trades')
      const tradesData = await response.json()
      setData(tradesData.trades)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [address, basePrice, limit])

  useEffect(() => {
    fetchTrades()
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchTrades, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchTrades, refreshInterval])

  return { data, loading, error, refetch: fetchTrades }
}

/**
 * Hook to fetch global market stats
 */
export function useMarketStats(refreshInterval: number = 5000) {
  const [data, setData] = useState<MarketStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats')
      if (!response.ok) throw new Error('Failed to fetch stats')
      const statsData = await response.json()
      setData(statsData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchStats, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchStats, refreshInterval])

  return { data, loading, error, refetch: fetchStats }
}
