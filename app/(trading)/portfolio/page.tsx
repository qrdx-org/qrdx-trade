import type { Metadata } from 'next'
import { Portfolio } from '@/components/portfolio/Portfolio'

export const metadata: Metadata = { title: 'Portfolio · QRDX Trade' }

export default function PortfolioPage() {
  return <Portfolio />
}
