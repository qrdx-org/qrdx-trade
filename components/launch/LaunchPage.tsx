'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LaunchFeed } from '@/components/launch/LaunchFeed'
import { LaunchForm } from '@/components/launch/LaunchForm'
import { isTokenAddress } from '@/lib/assets'

export function LaunchPage() {
  const [refresh, setRefresh] = useState(0)
  const param = useSearchParams().get('token')
  // ?token=0x… starts a market for an existing token instead of creating a new one.
  const existingToken = param && isTokenAddress(param) ? param.toLowerCase() : null
  return (
    <main className="mx-auto max-w-7xl px-3 py-6">
      <h1 className="text-2xl font-semibold">Launch</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Create a coin and start its market in two blocks, or create just the token and start its market later. A market
        puts the coin on a launch curve: buyers swap in and push the price up the curve, and it trades on the order book
        and through swaps like any other pair.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 lg:order-1">
          <LaunchFeed refreshKey={refresh} />
        </div>
        <div className="order-1 lg:order-2 lg:sticky lg:top-16 lg:self-start">
          <LaunchForm key={existingToken ?? 'new'} existingToken={existingToken} onLaunched={() => setRefresh((r) => r + 1)} />
        </div>
      </div>
    </main>
  )
}
