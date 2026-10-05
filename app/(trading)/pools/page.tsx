import type { Metadata } from 'next'
import { PoolsList } from '@/components/pools/PoolsList'

export const metadata: Metadata = { title: 'Pools · QRDX Trade' }

export default function PoolsPage() {
  return <PoolsList />
}
