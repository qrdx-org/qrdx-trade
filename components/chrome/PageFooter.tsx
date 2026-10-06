'use client'

import { usePathname } from 'next/navigation'
import { SiteFooter } from '@/components/chrome/SiteFooter'

/** The site footer, except under a trading terminal (/trade/x/y, /perps/x/y), which fills the screen. */
export function PageFooter() {
  const path = usePathname() ?? ''
  if (/^\/(trade|perps)\/[^/]+\/[^/]+/.test(path)) return null
  return <SiteFooter />
}
