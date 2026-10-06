'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LaunchFeed } from '@/components/launch/LaunchFeed'
import { LaunchForm } from '@/components/launch/LaunchForm'
import { MyTokens } from '@/components/launch/MyTokens'
import { TradeGate } from '@/components/trade/TradeGate'
import { Rocket } from 'lucide-react'
import { isTokenAddress } from '@/lib/assets'

export function LaunchPage() {
  const [refresh, setRefresh] = useState(0)
  const param = useSearchParams().get('token')
  // ?token=0x… starts a market for an existing token instead of creating a new one.
  const existingToken = param && isTokenAddress(param) ? param.toLowerCase() : null
  return (
    <main>
      <section className="hero-glow border-b">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-10">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Rocket className="h-3.5 w-3.5" /> Launchpad
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Launch a coin</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Create a coin and start its market in two blocks, or create just the token and start its market later. A market
            puts the coin on a launch curve: buyers swap in and push the price up the curve, and it trades on the order book
            and through swaps like any other pair.
          </p>
        </div>
      </section>
      <div className="mx-auto mt-8 grid max-w-7xl gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 lg:order-1">
          <LaunchFeed refreshKey={refresh} />
        </div>
        <div className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <TradeGate action="launch a coin">
            <LaunchForm key={existingToken ?? 'new'} existingToken={existingToken} onLaunched={() => setRefresh((r) => r + 1)} />
          </TradeGate>
          <MyTokens />
        </div>
      </div>
    </main>
  )
}
