'use client'

import { ExternalLink } from 'lucide-react'
import { explorerLink } from '@/lib/config'
import { useNet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/** Opens an address (account or token) or a transaction in this network's block explorer. */
export function ExplorerLink({
  kind = 'address',
  id,
  label,
  className,
}: {
  kind?: 'address' | 'tx'
  id: string
  /** Text before the icon; icon only when omitted. */
  label?: string
  className?: string
}) {
  const { network } = useNet()
  return (
    <a
      href={explorerLink(network, kind, id)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in explorer"
      aria-label={label ? undefined : 'Open in explorer'}
      onClick={(e) => e.stopPropagation()}
      className={cn('inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground', className)}
    >
      {label}
      <ExternalLink className="h-3 w-3 flex-shrink-0" />
    </a>
  )
}
