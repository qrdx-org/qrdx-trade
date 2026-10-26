import { PoolDetail } from '@/components/pools/PoolDetail'

export default async function PoolPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params
  return <PoolDetail poolId={decodeURIComponent(poolId)} />
}
