'use client'

import { use } from 'react'
import { redirect } from 'next/navigation'

export const runtime = 'edge'

interface PageProps {
  params: Promise<{ token: string }>
}

export default function TokenTradePage({ params }: PageProps) {
  const { token: tokenParam } = use(params)
  
  // Redirect to /trade/[token]/usdt since single token assumes USDT pair
  redirect(`/trade/${tokenParam}/usdt`)
}
