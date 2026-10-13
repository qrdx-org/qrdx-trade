import type { Metadata } from 'next'
import { StakeView } from '@/components/stake/StakeView'

export const metadata: Metadata = { title: 'Stake · QRDX Trade' }

export default function StakePage() {
  return <StakeView />
}
