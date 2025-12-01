'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TrendingUp, TrendingDown, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Stub data - would come from QRDX Chain API
interface Position {
  id: string
  symbol: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  leverage: number
  liquidationPrice: number
  margin: number
}

interface OpenOrder {
  id: string
  symbol: string
  type: 'limit' | 'stop-limit' | 'market'
  side: 'buy' | 'sell'
  amount: number
  price: number
  filled: number
  total: number
  time: string
  status: 'open' | 'partial'
}

interface OrderHistory {
  id: string
  symbol: string
  type: string
  side: 'buy' | 'sell'
  amount: number
  price: number
  total: number
  time: string
  status: 'filled' | 'cancelled'
}

// Stub data generators
const stubPositions: Position[] = [
  {
    id: '1',
    symbol: 'qETH/USDT',
    side: 'long',
    size: 1.5,
    entryPrice: 2820.50,
    currentPrice: 2845.32,
    pnl: 37.23,
    pnlPercent: 0.88,
    leverage: 1,
    liquidationPrice: 0,
    margin: 4230.75
  },
  {
    id: '2',
    symbol: 'qBTC/USDT',
    side: 'long',
    size: 0.05,
    entryPrice: 45150.00,
    currentPrice: 45231.21,
    pnl: 4.06,
    pnlPercent: 0.18,
    leverage: 1,
    liquidationPrice: 0,
    margin: 2257.50
  }
]

const stubOpenOrders: OpenOrder[] = [
  {
    id: '1',
    symbol: 'qSOL/USDT',
    type: 'limit',
    side: 'buy',
    amount: 10,
    price: 95.00,
    filled: 0,
    total: 950.00,
    time: '2025-12-01 10:23:15',
    status: 'open'
  },
  {
    id: '2',
    symbol: 'qADA/USDT',
    type: 'limit',
    side: 'sell',
    amount: 1000,
    price: 0.48,
    filled: 350,
    total: 480.00,
    time: '2025-12-01 09:45:32',
    status: 'partial'
  }
]

const stubOrderHistory: OrderHistory[] = [
  {
    id: '1',
    symbol: 'qETH/USDT',
    type: 'market',
    side: 'buy',
    amount: 1.5,
    price: 2820.50,
    total: 4230.75,
    time: '2025-12-01 08:15:42',
    status: 'filled'
  },
  {
    id: '2',
    symbol: 'qBTC/USDT',
    type: 'limit',
    side: 'buy',
    amount: 0.05,
    price: 45150.00,
    total: 2257.50,
    time: '2025-11-30 16:22:18',
    status: 'filled'
  },
  {
    id: '3',
    symbol: 'qBNB/USDT',
    type: 'market',
    side: 'sell',
    amount: 5,
    price: 310.20,
    total: 1551.00,
    time: '2025-11-30 14:10:05',
    status: 'filled'
  }
]

export function AccountSection() {
  return (
    <div className="space-y-4">
      {/* Account Overview */}
      <Card className="border-0 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Account Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Balance</div>
              <div className="text-xl font-bold">$16,789.52</div>
              <div className="text-xs text-green-500 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                +2.34% (24h)
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Available</div>
              <div className="text-xl font-bold">$10,301.27</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">In Orders</div>
              <div className="text-xl font-bold">$1,430.00</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Unrealized PNL</div>
              <div className="text-xl font-bold text-green-500">+$41.29</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Positions & Orders */}
      <Card className="border-0 bg-card/50 backdrop-blur">
        <Tabs defaultValue="positions" className="w-full">
          <CardHeader className="pb-3">
            <TabsList className="w-full justify-start h-9 bg-transparent p-0">
              <TabsTrigger value="positions" className="data-[state=active]:bg-accent">
                Positions ({stubPositions.length})
              </TabsTrigger>
              <TabsTrigger value="open-orders" className="data-[state=active]:bg-accent">
                Open Orders ({stubOpenOrders.length})
              </TabsTrigger>
              <TabsTrigger value="order-history" className="data-[state=active]:bg-accent">
                Order History
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent>
            <TabsContent value="positions" className="mt-0">
              {stubPositions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No open positions
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 font-medium">Symbol</th>
                        <th className="text-left py-2 font-medium">Side</th>
                        <th className="text-right py-2 font-medium">Size</th>
                        <th className="text-right py-2 font-medium">Entry Price</th>
                        <th className="text-right py-2 font-medium">Mark Price</th>
                        <th className="text-right py-2 font-medium">PNL</th>
                        <th className="text-right py-2 font-medium">Margin</th>
                        <th className="text-right py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stubPositions.map((position) => (
                        <tr key={position.id} className="border-b hover:bg-accent/50">
                          <td className="py-3 font-medium">{position.symbol}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              position.side === 'long' 
                                ? 'bg-green-500/10 text-green-500' 
                                : 'bg-red-500/10 text-red-500'
                            }`}>
                              {position.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 text-right font-mono">{position.size}</td>
                          <td className="py-3 text-right font-mono">${position.entryPrice.toFixed(2)}</td>
                          <td className="py-3 text-right font-mono">${position.currentPrice.toFixed(2)}</td>
                          <td className="py-3 text-right">
                            <div className={position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                              <div className="font-mono">${Math.abs(position.pnl).toFixed(2)}</div>
                              <div className="text-xs">{position.pnl >= 0 ? '+' : '-'}{Math.abs(position.pnlPercent).toFixed(2)}%</div>
                            </div>
                          </td>
                          <td className="py-3 text-right font-mono">${position.margin.toFixed(2)}</td>
                          <td className="py-3 text-right">
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600">
                              Close
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="open-orders" className="mt-0">
              {stubOpenOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No open orders
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 font-medium">Time</th>
                        <th className="text-left py-2 font-medium">Symbol</th>
                        <th className="text-left py-2 font-medium">Type</th>
                        <th className="text-left py-2 font-medium">Side</th>
                        <th className="text-right py-2 font-medium">Price</th>
                        <th className="text-right py-2 font-medium">Amount</th>
                        <th className="text-right py-2 font-medium">Filled</th>
                        <th className="text-right py-2 font-medium">Total</th>
                        <th className="text-right py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stubOpenOrders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-accent/50">
                          <td className="py-3">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {order.time}
                            </div>
                          </td>
                          <td className="py-3 font-medium">{order.symbol}</td>
                          <td className="py-3 text-xs capitalize">{order.type}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              order.side === 'buy' 
                                ? 'bg-green-500/10 text-green-500' 
                                : 'bg-red-500/10 text-red-500'
                            }`}>
                              {order.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 text-right font-mono">${order.price.toFixed(2)}</td>
                          <td className="py-3 text-right font-mono">{order.amount}</td>
                          <td className="py-3 text-right font-mono">{order.filled}/{order.amount}</td>
                          <td className="py-3 text-right font-mono">${order.total.toFixed(2)}</td>
                          <td className="py-3 text-right">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <X className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="order-history" className="mt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 font-medium">Time</th>
                      <th className="text-left py-2 font-medium">Symbol</th>
                      <th className="text-left py-2 font-medium">Type</th>
                      <th className="text-left py-2 font-medium">Side</th>
                      <th className="text-right py-2 font-medium">Price</th>
                      <th className="text-right py-2 font-medium">Amount</th>
                      <th className="text-right py-2 font-medium">Total</th>
                      <th className="text-right py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stubOrderHistory.map((order) => (
                      <tr key={order.id} className="border-b hover:bg-accent/50">
                        <td className="py-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {order.time}
                          </div>
                        </td>
                        <td className="py-3 font-medium">{order.symbol}</td>
                        <td className="py-3 text-xs capitalize">{order.type}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            order.side === 'buy' 
                              ? 'bg-green-500/10 text-green-500' 
                              : 'bg-red-500/10 text-red-500'
                          }`}>
                            {order.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono">${order.price.toFixed(2)}</td>
                        <td className="py-3 text-right font-mono">{order.amount}</td>
                        <td className="py-3 text-right font-mono">${order.total.toFixed(2)}</td>
                        <td className="py-3 text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            order.status === 'filled' 
                              ? 'bg-green-500/10 text-green-500' 
                              : 'bg-gray-500/10 text-gray-500'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}
