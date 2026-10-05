import { redirect } from 'next/navigation'

export const runtime = 'edge'

/** Perps quote in the node's PERP_QUOTE (USD): /perps/btc → /perps/btc/usd. */
export default async function PerpBasePage({ params }: { params: Promise<{ base: string }> }) {
  const { base } = await params
  redirect(`/perps/${base.toLowerCase()}/usd`)
}
