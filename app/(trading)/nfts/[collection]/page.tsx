import { Suspense } from 'react'
import { CollectionView } from '@/components/nfts/CollectionView'

export default async function NftCollectionPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params
  return (
    <Suspense>
      <CollectionView address={decodeURIComponent(collection).toLowerCase()} />
    </Suspense>
  )
}
