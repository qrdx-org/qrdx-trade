import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CreatePool } from '@/components/pools/CreatePool'

export const metadata: Metadata = { title: 'New pool · QRDX Trade' }

export default function NewPoolPage() {
  return (
    <Suspense>
      <CreatePool />
    </Suspense>
  )
}
