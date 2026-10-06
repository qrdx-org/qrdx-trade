import type { Metadata } from 'next'
import { CreatePerp } from '@/components/perps/CreatePerp'

export const metadata: Metadata = { title: 'Create a perpetual market · QRDX Trade' }

export default function NewPerpPage() {
  return <CreatePerp />
}
