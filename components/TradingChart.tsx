'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface ChartDataPoint {
  time: string
  price: number
}

export function TradingChart() {
  const [timeframe, setTimeframe] = useState<'1H' | '1D' | '1W' | '1M' | '1Y'>('1D')
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [currentPrice, setCurrentPrice] = useState(2845.32)
  const [priceChange, setPriceChange] = useState(4.32)
  
  useEffect(() => {
    // Generate realistic mock data
    const generateData = () => {
      const basePrice = 2800
      const points = timeframe === '1H' ? 60 : timeframe === '1D' ? 96 : timeframe === '1W' ? 168 : timeframe === '1M' ? 720 : 365
      const data: ChartDataPoint[] = []
      
      for (let i = 0; i < points; i++) {
        const volatility = basePrice * 0.02
        const trend = Math.sin(i / 10) * volatility
        const noise = (Math.random() - 0.5) * volatility * 0.5
        const price = basePrice + trend + noise + (i * 2)
        
        let timeLabel = ''
        if (timeframe === '1H') {
          timeLabel = `${String(i).padStart(2, '0')}:00`
        } else if (timeframe === '1D') {
          timeLabel = `${String(Math.floor(i / 4)).padStart(2, '0')}:${(i % 4) * 15}`
        } else {
          timeLabel = `Day ${i + 1}`
        }
        
        data.push({
          time: timeLabel,
          price: parseFloat(price.toFixed(2))
        })
      }
      
      setChartData(data)
      if (data.length > 0) {
        const latest = data[data.length - 1].price
        const first = data[0].price
        setCurrentPrice(latest)
        setPriceChange(((latest - first) / first) * 100)
      }
    }
    
    generateData()
    
    // Simulate live updates
    const interval = setInterval(() => {
      setChartData(prevData => {
        if (prevData.length === 0) return prevData
        const newData = [...prevData]
        const lastPrice = newData[newData.length - 1].price
        const change = (Math.random() - 0.5) * 20
        const newPrice = Math.max(0, lastPrice + change)
        
        newData.push({
          time: new Date().toLocaleTimeString(),
          price: parseFloat(newPrice.toFixed(2))
        })
        
        if (newData.length > (timeframe === '1H' ? 60 : 96)) {
          newData.shift()
        }
        
        setCurrentPrice(newPrice)
        const first = newData[0].price
        setPriceChange(((newPrice - first) / first) * 100)
        
        return newData
      })
    }, 3000)
    
    return () => clearInterval(interval)
  }, [timeframe])

  return (
    <motion.div 
      className="bg-card/50 backdrop-blur rounded-lg border p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold">qETH/USDT</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-3xl font-bold">${currentPrice.toFixed(2)}</span>
            <span className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded ${priceChange >= 0 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>
              {priceChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
        </div>
        
        <div className="flex gap-1">
          {(['1H', '1D', '1W', '1M', '1Y'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeframe === tf
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      
      <div className="h-[350px] w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={priceChange >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={priceChange >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="time" 
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 12 }}
              tickFormatter={(value, index) => index % Math.ceil(chartData.length / 6) === 0 ? value : ''}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 12 }}
              domain={['auto', 'auto']}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                padding: '8px'
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
            />
            <Area 
              type="monotone" 
              dataKey="price" 
              stroke={priceChange >= 0 ? "#10b981" : "#ef4444"}
              strokeWidth={2}
              fill="url(#colorPrice)" 
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}
