import type { Metadata } from 'next'
import { MarketHome } from '@/components/nfts/MarketHome'

export const metadata: Metadata = { title: 'NFTs · QRDX Trade' }

export default function NftsPage() {
  return <MarketHome />
}
