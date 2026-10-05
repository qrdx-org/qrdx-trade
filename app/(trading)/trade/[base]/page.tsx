import { DefaultPairRedirect } from '@/components/routing/NetworkRedirect'

export const runtime = 'edge'

/** Trading is always in pairs: /trade/qrdx → /trade/qrdx/{its default quote on the network shown}. */
export default async function BaseOnlyPage({ params }: { params: Promise<{ base: string }> }) {
  const { base } = await params
  return <DefaultPairRedirect base={base.toLowerCase()} />
}
