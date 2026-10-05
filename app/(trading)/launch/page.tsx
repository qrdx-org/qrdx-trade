import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LaunchPage } from '@/components/launch/LaunchPage'

export const metadata: Metadata = { title: 'Launch · QRDX Trade' }

export default function Launch() {
  return (
    <Suspense>
      <LaunchPage />
    </Suspense>
  )
}
