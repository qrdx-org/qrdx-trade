import type { Metadata } from 'next'
import { CreateCollection } from '@/components/nfts/CreateCollection'

export const metadata: Metadata = { title: 'Create an NFT collection · QRDX Trade' }

export default function CreateNftCollectionPage() {
  return <CreateCollection />
}
