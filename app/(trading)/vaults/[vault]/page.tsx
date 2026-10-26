import type { Metadata } from 'next'
import { VaultDetail } from '@/components/vaults/VaultDetail'

export const metadata: Metadata = { title: 'Vault · QRDX Trade' }
export default async function VaultPage({ params }: { params: Promise<{ vault: string }> }) {
  return <VaultDetail address={(await params).vault} />
}
