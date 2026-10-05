import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SwapCard } from '@/components/swap/SwapCard'

export const metadata: Metadata = { title: 'Swap · QRDX Trade' }

export default function SwapPage() {
  return (
    <Suspense>
      <SwapCard />
    </Suspense>
  )
}
