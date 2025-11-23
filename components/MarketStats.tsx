'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Users, Droplets, Activity, DollarSign, BarChart3 } from 'lucide-react'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  change?: string
  positive?: boolean
}

function StatCard({ icon, label, value, change, positive = true }: StatCardProps) {
  return (
    <motion.div
      className="bg-card rounded-lg border p-4 hover:shadow-lg transition-shadow"
      whileHover={{ y: -2 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {change && (
              <p className={`text-xs mt-1 ${positive ? 'text-green-500' : 'text-red-500'}`}>
                {positive ? '+' : ''}{change}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function MarketStats() {
  const stats = [
    {
      icon: <DollarSign className="h-5 w-5 text-primary" />,
      label: 'Total Value Locked',
      value: '$2.4B',
      change: '+12.3%',
      positive: true
    },
    {
      icon: <Activity className="h-5 w-5 text-primary" />,
      label: '24h Volume',
      value: '$847M',
      change: '+8.7%',
      positive: true
    },
    {
      icon: <Users className="h-5 w-5 text-primary" />,
      label: 'Active Users',
      value: '156K+',
      change: '+15.2%',
      positive: true
    },
    {
      icon: <Droplets className="h-5 w-5 text-primary" />,
      label: 'Liquidity Pools',
      value: '2,847',
      change: '+24',
      positive: true
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
      label: 'Total Trades',
      value: '1.2M+',
      change: '+5.4%',
      positive: true
    },
    {
      icon: <BarChart3 className="h-5 w-5 text-primary" />,
      label: 'Avg. APY',
      value: '24.5%',
      change: '+2.1%',
      positive: true
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <StatCard {...stat} />
        </motion.div>
      ))}
    </div>
  )
}
