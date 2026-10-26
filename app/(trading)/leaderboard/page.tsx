import type { Metadata } from 'next'
import { Leaderboard } from '@/components/vaults/Leaderboard'

export const metadata: Metadata = { title: 'Leaderboard · QRDX Trade' }

export default function LeaderboardPage() {
  return <Leaderboard />
}
