import type { Metadata } from 'next'
import { MarketsTable } from '@/components/trade/MarketsTable'

export const metadata: Metadata = { title: 'Markets · QRDX Trade' }

export default function MarketsPage() {
  return <MarketsTable />
}
