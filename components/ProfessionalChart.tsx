'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, CandlestickChart } from 'recharts'
import { TrendingUp, TrendingDown, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChartDataPoint {
  time: string
  price: number
  volume?: number
}

interface ProfessionalChartProps {
  symbol: string
  currentPrice: number
  priceChange: number
}

export function ProfessionalChart({ symbol, currentPrice, priceChange }: ProfessionalChartProps) {
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W'>('1h')
  const [chartType, setChartType] = useState<'line' | 'candle'>('line')
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])

  useEffect(() => {
    // Generate realistic stub chart data
    const generateData = () => {
      const basePrice = currentPrice
      const points = timeframe === '1m' ? 60 : timeframe === '5m' ? 288 : timeframe === '15m' ? 96 : timeframe === '1h' ? 168 : timeframe === '4h' ? 180 : timeframe === '1D' ? 90 : 365
      const data: ChartDataPoint[] = []
      
      let price = basePrice * 0.98 // Start slightly lower
      
      for (let i = 0; i < points; i++) {
        // Add realistic price movement with trend
        const volatility = basePrice * 0.002
        const trend = (priceChange / 100) * basePrice / points
        const noise = (Math.random() - 0.5) * volatility
        
        price = price + trend + noise
        
        let timeLabel = ''
        if (timeframe === '1m' || timeframe === '5m' || timeframe === '15m') {
          const date = new Date(Date.now() - (points - i) * parseInt(timeframe) * 60000)
          timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        } else if (timeframe === '1h' || timeframe === '4h') {
          const date = new Date(Date.now() - (points - i) * parseInt(timeframe.replace('h', '')) * 3600000)
          timeLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' })
        } else {
          const date = new Date(Date.now() - (points - i) * 86400000)
          timeLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
        
        data.push({
          time: timeLabel,
          price: parseFloat(price.toFixed(2)),
          volume: Math.random() * 1000000 + 100000
        })
      }
      
      setChartData(data)
    }
    
    generateData()
    
    // Simulate live updates for short timeframes
    if (['1m', '5m', '15m'].includes(timeframe)) {
      const interval = setInterval(() => {
        setChartData(prev => {
          if (prev.length === 0) return prev
          const newData = [...prev]
          const lastPrice = newData[newData.length - 1].price
          const change = (Math.random() - 0.5) * currentPrice * 0.001
          const newPrice = Math.max(0, lastPrice + change)
          
          newData.push({
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            price: parseFloat(newPrice.toFixed(2)),
            volume: Math.random() * 1000000 + 100000
          })
          
          // Keep only recent data
          const maxPoints = timeframe === '1m' ? 60 : timeframe === '5m' ? 288 : 96
          if (newData.length > maxPoints) {
            newData.shift()
          }
          
          return newData
        })
      }, 3000)
      
      return () => clearInterval(interval)
    }
  }, [timeframe, currentPrice, priceChange])

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <p className="text-xs text-muted-foreground mb-1">{payload[0].payload.time}</p>
          <p className="text-sm font-bold">${payload[0].value.toFixed(2)}</p>
          {payload[0].payload.volume && (
            <p className="text-xs text-muted-foreground mt-1">
              Vol: ${(payload[0].payload.volume / 1000).toFixed(1)}K
            </p>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <Card className="border-0 bg-card/50 backdrop-blur">
      <div className="p-4">
        {/* Chart Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold">{symbol}</h3>
              <span className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded ${
                priceChange >= 0 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'
              }`}>
                {priceChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold">${currentPrice.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">≈ ${currentPrice.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Timeframe and Chart Type Selector */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            {(['1m', '5m', '15m', '1h', '4h', '1D', '1W'] as const).map((tf) => (
              <Button
                key={tf}
                variant="ghost"
                size="sm"
                className={`h-8 px-3 text-xs ${
                  timeframe === tf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </Button>
            ))}
          </div>
          
          <Tabs value={chartType} onValueChange={(v) => setChartType(v as any)} className="w-auto">
            <TabsList className="h-8">
              <TabsTrigger value="line" className="text-xs h-7">Line</TabsTrigger>
              <TabsTrigger value="candle" className="text-xs h-7">Candles</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Chart */}
        <div className="h-[450px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop 
                    offset="5%" 
                    stopColor={priceChange >= 0 ? '#22c55e' : '#ef4444'} 
                    stopOpacity={0.3}
                  />
                  <stop 
                    offset="95%" 
                    stopColor={priceChange >= 0 ? '#22c55e' : '#ef4444'} 
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="time" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 10', 'dataMax + 10']}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="price" 
                stroke={priceChange >= 0 ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                fill="url(#colorPrice)"
                animationDuration={300}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Chart Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div>
            <div className="text-xs text-muted-foreground mb-1">24h High</div>
            <div className="font-mono text-sm font-medium">${(currentPrice * 1.05).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">24h Low</div>
            <div className="font-mono text-sm font-medium">${(currentPrice * 0.95).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
            <div className="font-mono text-sm font-medium">${(Math.random() * 50000000 + 10000000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">24h Trades</div>
            <div className="font-mono text-sm font-medium">{Math.floor(Math.random() * 50000 + 10000).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </Card>
  )
}
