import type { Metadata } from 'next'
import { SpotTradeView } from '@/components/trade/SpotTradeView'

export const runtime = 'edge'

interface Props {
  params: Promise<{ base: string; quote: string }>
}

const label = (s: string) => (/^0x[0-9a-fA-F]{40}$/.test(s) ? `${s.slice(0, 8)}…` : s.toUpperCase())

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { base, quote } = await params
  return { title: `${label(base)}/${label(quote)} · QRDX Trade` }
}

export default async function SpotPairPage({ params }: Props) {
  const { base, quote } = await params
  return <SpotTradeView base={base.toLowerCase()} quote={quote.toLowerCase()} />
}
