import type { Metadata } from 'next'
import { PerpTradeView } from '@/components/trade/PerpTradeView'

export const runtime = 'edge'

interface Props {
  params: Promise<{ base: string; quote: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { base, quote } = await params
  return { title: `${base.toUpperCase()}-${quote.toUpperCase()} Perp · QRDX Trade` }
}

export default async function PerpPage({ params }: Props) {
  const { base, quote } = await params
  return <PerpTradeView base={base.toLowerCase()} quote={quote.toLowerCase()} />
}
