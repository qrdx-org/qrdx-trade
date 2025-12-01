'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { 
  createChart, 
  ColorType,
  CrosshairMode,
  CandlestickData,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
} from 'lightweight-charts'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSearchParams } from 'next/navigation'
import { 
  TrendingUp, 
  TrendingDown, 
  Maximize2, 
  MinusSquare,
  PlusSquare,
  MousePointer2,
  TrendingUpDown,
  Minus,
  Activity,
  BarChart3,
  CandlestickChart,
  GitBranch,
  PenTool,
  Triangle,
  Circle,
  Square,
  DollarSign,
} from 'lucide-react'

interface TradingViewChartProps {
  symbol: string
  currentPrice: number
  priceChange: number
  onBuyOrder?: (price: number, stopLoss?: number, takeProfit?: number) => void
  onSellOrder?: (price: number, stopLoss?: number, takeProfit?: number) => void
  onOrderUpdate?: (orderId: string, newPrice: number) => void
  buyOrderPrice?: number | null
  sellOrderPrice?: number | null
}

interface OrderLine {
  id: string
  type: 'buy' | 'sell' | 'stop-loss' | 'take-profit'
  price: number
  priceLine: any
  isDragging?: boolean
}

interface DrawingTool {
  id: string
  type: 'trendline' | 'horizontal' | 'fibonacci' | 'rectangle' | 'triangle' | 'circle'
  points: Array<{ time: number, price: number }>
  color: string
}

export function TradingViewChart({ 
  symbol, 
  currentPrice, 
  priceChange,
  onBuyOrder,
  onSellOrder,
  onOrderUpdate,
  buyOrderPrice,
  sellOrderPrice 
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const chartWatermarkRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const marketCapSeriesRef = useRef<any>(null)
  const tradingInterfaceBuyLineRef = useRef<any>(null)
  const tradingInterfaceSellLineRef = useRef<any>(null)
  const searchParams = useSearchParams()
  const [timeframe, setTimeframe] = useState<'1' | '5' | '15' | '60' | '240' | 'D' | 'W'>('60')
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area' | 'bar'>('candlestick')
  const [drawingMode, setDrawingMode] = useState<'none' | 'buy' | 'sell' | 'trendline' | 'horizontal' | 'fibonacci'>('none')
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [activeOrder, setActiveOrder] = useState<{ buy?: number, sell?: number, stopLoss?: number, takeProfit?: number }>({})
  const [drawings, setDrawings] = useState<DrawingTool[]>([])
  const [draggedLine, setDraggedLine] = useState<string | null>(null)
  const [showMarketCap, setShowMarketCap] = useState(false)
  const isShareMode = searchParams?.get('share') === 'true'

  useEffect(() => {
    if (!chartContainerRef.current) return

    // Create chart with proper configuration
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        visible: true,
      },
      leftPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        visible: showMarketCap,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    // Add watermark for share mode
    if (isShareMode) {
      chart.applyOptions({
        watermark: {
          visible: true,
          fontSize: 48,
          horzAlign: 'center',
          vertAlign: 'center',
          color: 'rgba(147, 51, 234, 0.15)',
          text: 'QRDX',
        } as any,
      })
    }

    // Generate data
    const generateData = (): CandlestickData[] => {
      const data: CandlestickData[] = []
      const basePrice = currentPrice
      const now = Math.floor(Date.now() / 1000)
      const interval = timeframe === '1' ? 60 : timeframe === '5' ? 300 : timeframe === '15' ? 900 : timeframe === '60' ? 3600 : timeframe === '240' ? 14400 : timeframe === 'D' ? 86400 : 604800
      const bars = 200
      
      let price = basePrice * 0.95
      
      for (let i = bars; i >= 0; i--) {
        const time = (now - (i * interval))
        const volatility = basePrice * 0.015
        const trend = (priceChange / 100) * basePrice / bars
        
        const open = price
        const change = (Math.random() - 0.5) * volatility + trend
        const close = open + change
        const high = Math.max(open, close) + Math.random() * volatility * 0.3
        const low = Math.min(open, close) - Math.random() * volatility * 0.3
        
        data.push({
          time: time as any,
          open: parseFloat(open.toFixed(2)),
          high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)),
          close: parseFloat(close.toFixed(2)),
        })
        
        price = close
      }
      
      return data
    }

    const data = generateData()

    // Add series based on chart type
    let series: any
    if (chartType === 'candlestick') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })
      series.setData(data)
    } else if (chartType === 'line') {
      series = chart.addSeries(LineSeries, {
        color: '#9333ea',
        lineWidth: 2,
      })
      series.setData(data.map(d => ({ time: d.time, value: d.close })))
    } else if (chartType === 'area') {
      series = chart.addSeries(AreaSeries, {
        topColor: 'rgba(147, 51, 234, 0.4)',
        bottomColor: 'rgba(147, 51, 234, 0.0)',
        lineColor: '#9333ea',
        lineWidth: 2,
      })
      series.setData(data.map(d => ({ time: d.time, value: d.close })))
    } else if (chartType === 'bar') {
      series = chart.addSeries(BarSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
      })
      series.setData(data.map(d => ({ 
        time: d.time, 
        open: d.open, 
        high: d.high, 
        low: d.low, 
        close: d.close 
      })))
    }

    chartRef.current = chart
    seriesRef.current = series

    // Add market cap overlay line if enabled
    if (showMarketCap) {
      const marketCapSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        priceScaleId: 'left',
        title: 'Market Cap',
      })

      // Generate market cap data (simulated - scale with price movements)
      const marketCapData = data.map(d => {
        const baseMarketCap = currentPrice * 1000000 // Assume 1M supply
        const priceRatio = d.close / currentPrice
        return {
          time: d.time,
          value: baseMarketCap * priceRatio,
        }
      })

      marketCapSeries.setData(marketCapData)
      marketCapSeriesRef.current = marketCapSeries
    }

    chart.timeScale().fitContent()

    // Re-add existing order lines
    orderLines.forEach(line => {
      if (line.priceLine) {
        seriesRef.current?.removePriceLine(line.priceLine)
      }
      const color = line.type === 'buy' ? '#22c55e' : line.type === 'sell' ? '#ef4444' : line.type === 'stop-loss' ? '#f59e0b' : '#3b82f6'
      const title = line.type === 'buy' ? '📈 Buy' : line.type === 'sell' ? '📉 Sell' : line.type === 'stop-loss' ? '🛑 Stop Loss' : '🎯 Take Profit'
      
      const priceLine = series.createPriceLine({
        price: line.price,
        color,
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title,
      })
      
      line.priceLine = priceLine
    })

    // Handle chart clicks for placing orders and drawings
    const handleChartClick = (param: any) => {
      if (!param.point) return
      
      const price = seriesRef.current?.coordinateToPrice(param.point.y)
      if (!price) return

      if (drawingMode === 'buy') {
        addOrderLine('buy', price)
        setActiveOrder({ ...activeOrder, buy: price })
        setDrawingMode('none')
      } else if (drawingMode === 'sell') {
        addOrderLine('sell', price)
        setActiveOrder({ ...activeOrder, sell: price })
        setDrawingMode('none')
      } else if (drawingMode === 'horizontal') {
        addHorizontalLine(price)
        setDrawingMode('none')
      }
    }

    // Handle dragging order lines
    const handleMouseMove = (param: any) => {
      if (!draggedLine || !param.point) return
      
      const newPrice = seriesRef.current?.coordinateToPrice(param.point.y)
      if (!newPrice) return

      updateOrderLinePrice(draggedLine, newPrice)
    }

    const handleMouseUp = () => {
      if (draggedLine && onOrderUpdate) {
        const line = orderLines.find(l => l.id === draggedLine)
        if (line) {
          onOrderUpdate(draggedLine, line.price)
        }
      }
      setDraggedLine(null)
    }

    chart.subscribeCrosshairMove(handleChartClick)

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 500,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('mouseup', handleMouseUp)

      return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mouseup', handleMouseUp)
      chart.remove()
    }
  }, [timeframe, currentPrice, priceChange, drawingMode, chartType, showMarketCap, isShareMode])

  // Effect to handle buy/sell order price lines from TradingInterface
  useEffect(() => {
    if (!seriesRef.current) return

    // Handle buy order price line
    if (tradingInterfaceBuyLineRef.current) {
      seriesRef.current.removePriceLine(tradingInterfaceBuyLineRef.current)
      tradingInterfaceBuyLineRef.current = null
    }

    if (buyOrderPrice && buyOrderPrice > 0) {
      const buyLine = seriesRef.current.createPriceLine({
        price: buyOrderPrice,
        color: '#22c55e',
        lineWidth: 2,
        lineStyle: 1, // Dashed
        axisLabelVisible: true,
        title: '📈 Buy Limit',
      })
      tradingInterfaceBuyLineRef.current = buyLine
    }

    // Handle sell order price line
    if (tradingInterfaceSellLineRef.current) {
      seriesRef.current.removePriceLine(tradingInterfaceSellLineRef.current)
      tradingInterfaceSellLineRef.current = null
    }

    if (sellOrderPrice && sellOrderPrice > 0) {
      const sellLine = seriesRef.current.createPriceLine({
        price: sellOrderPrice,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 1, // Dashed
        axisLabelVisible: true,
        title: '📉 Sell Limit',
      })
      tradingInterfaceSellLineRef.current = sellLine
    }
  }, [buyOrderPrice, sellOrderPrice])

  const addOrderLine = (type: 'buy' | 'sell' | 'stop-loss' | 'take-profit', price: number) => {
    if (!seriesRef.current) return

    const color = type === 'buy' ? '#22c55e' : type === 'sell' ? '#ef4444' : type === 'stop-loss' ? '#f59e0b' : '#3b82f6'
    const title = type === 'buy' ? '📈 Buy' : type === 'sell' ? '📉 Sell' : type === 'stop-loss' ? '🛑 Stop Loss' : '🎯 Take Profit'

    const priceLine = seriesRef.current.createPriceLine({
      price,
      color,
      lineWidth: 2,
      lineStyle: 0, // Solid line
      axisLabelVisible: true,
      title,
    })

    const newLine: OrderLine = {
      id: `${type}-${Date.now()}`,
      type,
      price,
      priceLine,
    }

    setOrderLines((prev) => [...prev, newLine])
  }

  const addHorizontalLine = (price: number) => {
    if (!seriesRef.current) return

    const priceLine = seriesRef.current.createPriceLine({
      price,
      color: '#6b7280',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: '─ Line',
    })

    const newLine: OrderLine = {
      id: `line-${Date.now()}`,
      type: 'buy', // Just a placeholder type
      price,
      priceLine,
    }

    setOrderLines((prev) => [...prev, newLine])
  }

  const updateOrderLinePrice = (lineId: string, newPrice: number) => {
    setOrderLines((prev) => 
      prev.map((line) => {
        if (line.id === lineId) {
          // Remove old price line
          if (seriesRef.current && line.priceLine) {
            seriesRef.current.removePriceLine(line.priceLine)
          }

          // Create new price line at updated position
          const color = line.type === 'buy' ? '#22c55e' : line.type === 'sell' ? '#ef4444' : line.type === 'stop-loss' ? '#f59e0b' : '#3b82f6'
          const title = line.type === 'buy' ? '📈 Buy' : line.type === 'sell' ? '📉 Sell' : line.type === 'stop-loss' ? '🛑 Stop Loss' : '🎯 Take Profit'

          const newPriceLine = seriesRef.current?.createPriceLine({
            price: newPrice,
            color,
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: true,
            title,
          })

          return { ...line, price: newPrice, priceLine: newPriceLine }
        }
        return line
      })
    )

    // Update active order if it's the one being dragged
    if (lineId.includes('buy')) {
      setActiveOrder({ ...activeOrder, buy: newPrice })
    } else if (lineId.includes('sell')) {
      setActiveOrder({ ...activeOrder, sell: newPrice })
    } else if (lineId.includes('stop-loss')) {
      setActiveOrder({ ...activeOrder, stopLoss: newPrice })
    } else if (lineId.includes('take-profit')) {
      setActiveOrder({ ...activeOrder, takeProfit: newPrice })
    }
  }

  const removeOrderLine = (id: string) => {
    const line = orderLines.find((l) => l.id === id)
    if (line && seriesRef.current) {
      seriesRef.current.removePriceLine(line.priceLine)
      setOrderLines((prev) => prev.filter((l) => l.id !== id))
    }
  }

  const clearAllLines = () => {
    orderLines.forEach((line) => {
      if (seriesRef.current) {
        seriesRef.current.removePriceLine(line.priceLine)
      }
    })
    setOrderLines([])
    setActiveOrder({})
  }

  const addStopLoss = () => {
    if (activeOrder.buy) {
      const slPrice = activeOrder.buy * 0.97 // 3% below buy
      addOrderLine('stop-loss', slPrice)
      setActiveOrder({ ...activeOrder, stopLoss: slPrice })
    } else if (activeOrder.sell) {
      const slPrice = activeOrder.sell * 1.03 // 3% above sell
      addOrderLine('stop-loss', slPrice)
      setActiveOrder({ ...activeOrder, stopLoss: slPrice })
    }
  }

  const addTakeProfit = () => {
    if (activeOrder.buy) {
      const tpPrice = activeOrder.buy * 1.05 // 5% above buy
      addOrderLine('take-profit', tpPrice)
      setActiveOrder({ ...activeOrder, takeProfit: tpPrice })
    } else if (activeOrder.sell) {
      const tpPrice = activeOrder.sell * 0.95 // 5% below sell
      addOrderLine('take-profit', tpPrice)
      setActiveOrder({ ...activeOrder, takeProfit: tpPrice })
    }
  }

  const confirmOrder = () => {
    if (activeOrder.buy && onBuyOrder) {
      onBuyOrder(activeOrder.buy, activeOrder.stopLoss, activeOrder.takeProfit)
    } else if (activeOrder.sell && onSellOrder) {
      onSellOrder(activeOrder.sell, activeOrder.stopLoss, activeOrder.takeProfit)
    }
    clearAllLines()
    setDrawingMode('none')
  }

  return (
    <Card className="border-0 bg-card/50 backdrop-blur">
      <div className="p-4">
        {/* Chart Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold">{symbol}/USDT</h3>
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
            {isShareMode && (
              <div className="text-xs text-muted-foreground px-2 py-1 bg-primary/10 rounded">
                📊 Shared Chart
              </div>
            )}
          </div>
        </div>

        {/* Timeframe and Drawing Tools */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
          <div className="flex gap-1">
            {(['1', '5', '15', '60', '240', 'D', 'W'] as const).map((tf) => (
              <Button
                key={tf}
                variant="ghost"
                size="sm"
                className={`h-8 px-3 text-xs ${
                  timeframe === tf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => setTimeframe(tf)}
              >
                {tf === '1' ? '1m' : tf === '5' ? '5m' : tf === '15' ? '15m' : tf === '60' ? '1H' : tf === '240' ? '4H' : tf}
              </Button>
            ))}
          </div>

          {/* Chart Type Selector */}
          <div className="flex gap-1">
            <Button
              variant={chartType === 'candlestick' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setChartType('candlestick')}
              title="Candlestick"
            >
              <CandlestickChart className="h-4 w-4" />
            </Button>
            <Button
              variant={chartType === 'bar' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setChartType('bar')}
              title="Bar Chart"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant={chartType === 'line' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setChartType('line')}
              title="Line Chart"
            >
              <Activity className="h-4 w-4" />
            </Button>
            <Button
              variant={chartType === 'area' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setChartType('area')}
              title="Area Chart"
            >
              <TrendingUpDown className="h-4 w-4" />
            </Button>
            
            {/* Market Cap Overlay Toggle */}
            <div className="h-8 w-px bg-border mx-1" />
            <Button
              variant={showMarketCap ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setShowMarketCap(!showMarketCap)}
              title="Show Market Cap"
            >
              <DollarSign className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Drawing Tools */}
            <Button
              variant={drawingMode === 'buy' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setDrawingMode(drawingMode === 'buy' ? 'none' : 'buy')}
            >
              <PlusSquare className="h-3 w-3 mr-1" />
              Buy
            </Button>
            <Button
              variant={drawingMode === 'sell' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setDrawingMode(drawingMode === 'sell' ? 'none' : 'sell')}
            >
              <MinusSquare className="h-3 w-3 mr-1" />
              Sell
            </Button>
            <Button
              variant={drawingMode === 'horizontal' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setDrawingMode(drawingMode === 'horizontal' ? 'none' : 'horizontal')}
              title="Horizontal Line"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Button
              variant={drawingMode === 'trendline' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setDrawingMode(drawingMode === 'trendline' ? 'none' : 'trendline')}
              title="Trend Line"
            >
              <GitBranch className="h-3 w-3" />
            </Button>
            <Button
              variant={drawingMode === 'fibonacci' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setDrawingMode(drawingMode === 'fibonacci' ? 'none' : 'fibonacci')}
              title="Fibonacci Retracement"
            >
              <PenTool className="h-3 w-3" />
            </Button>
            
            {(activeOrder.buy || activeOrder.sell) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={addStopLoss}
                  disabled={!!activeOrder.stopLoss}
                >
                  🛑 SL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={addTakeProfit}
                  disabled={!!activeOrder.takeProfit}
                >
                  🎯 TP
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700"
                  onClick={confirmOrder}
                >
                  ✓ Confirm
                </Button>
              </>
            )}
            
            {orderLines.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-red-500"
                onClick={clearAllLines}
              >
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Drawing Mode Indicator */}
        {drawingMode !== 'none' && (
          <div className="mb-2 p-2 rounded bg-primary/10 text-primary text-xs font-medium flex items-center gap-2">
            <MousePointer2 className="h-3 w-3" />
            Click on the chart to place a {drawingMode === 'buy' ? 'BUY' : 'SELL'} order
          </div>
        )}

        {/* Chart Container */}
        <div 
          ref={chartContainerRef} 
          className="w-full h-[500px] rounded-lg"
          style={{ position: 'relative' }}
        />

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
            <div className="text-xs text-muted-foreground mb-1">Active Orders</div>
            <div className="font-mono text-sm font-medium">{orderLines.length}</div>
          </div>
        </div>

        {/* Order Lines List */}
        {orderLines.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-xs font-semibold mb-2">Active Lines (Drag to adjust prices)</div>
            <div className="space-y-1">
              {orderLines.map((line) => (
                <div 
                  key={line.id} 
                  className="flex items-center justify-between text-xs p-2 rounded bg-muted/30 cursor-move hover:bg-muted/50 transition-colors"
                  onMouseDown={() => setDraggedLine(line.id)}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      line.type === 'buy' ? 'bg-green-500' : 
                      line.type === 'sell' ? 'bg-red-500' : 
                      line.type === 'stop-loss' ? 'bg-orange-500' : 'bg-blue-500'
                    }`} />
                    <span className="font-medium capitalize">{line.type.replace('-', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={line.price.toFixed(2)}
                      onChange={(e) => {
                        const newPrice = parseFloat(e.target.value)
                        if (!isNaN(newPrice)) {
                          updateOrderLinePrice(line.id, newPrice)
                        }
                      }}
                      className="w-24 px-2 py-1 bg-background border rounded text-xs font-mono"
                      step="0.01"
                    />
                    <button
                      onClick={() => removeOrderLine(line.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              💡 Tip: Drag lines on the chart or edit prices directly to adjust your orders
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
