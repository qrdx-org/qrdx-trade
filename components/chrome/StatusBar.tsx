'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, Boxes, Github } from 'lucide-react'
import { useApi } from '@/lib/hooks/useApi'
import { useNet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

interface Status {
  network: string
  networkName: string
  chainId: number
  blockTimeSec: number
  nodeOk: boolean
  height: number | null
  latencyMs: number | null
}

/**
 * The terminal's bottom bar: node health, chain height and how long ago this
 * page saw it advance, the network, and where the API lives.
 */
export function StatusBar() {
  const { apiBase, network, slot } = useNet()
  const { data, error } = useApi<Status>(`${apiBase}/status`, 5_000)
  const seen = useBlockSeen(data?.height ?? null)
  const now = useNow()

  const ok = !!data?.nodeOk
  const state = !data ? (error ? 'down' : 'wait') : ok ? 'ok' : 'down'
  const ago = seen ? Math.max(0, Math.round((now - seen) / 1000)) : null

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t bg-card px-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5" title={data?.latencyMs != null ? `Node answered in ${data.latencyMs} ms` : undefined}>
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            state === 'ok' ? 'pulse-dot bg-bid text-bid' : state === 'down' ? 'bg-ask' : 'bg-muted-foreground'
          )}
        />
        <span className={cn(state === 'down' && 'text-ask')}>
          {state === 'ok' ? 'Operational' : state === 'down' ? 'Node unreachable' : 'Connecting'}
        </span>
        {data?.latencyMs != null && <span className="num hidden sm:inline">· {data.latencyMs} ms</span>}
      </span>

      <span className="hidden items-center gap-1.5 sm:flex">
        <span className={cn('rounded-sm px-1 text-[10px] font-semibold uppercase tracking-wide', slot === 'test' ? 'bg-warn/15 text-warn' : 'bg-primary/15 text-primary')}>
          {slot === 'test' ? (network.id === 'local' ? 'Local' : 'Testnet') : 'Mainnet'}
        </span>
        {network.name} · chain {network.chainId}
      </span>

      {data?.height != null && data.height >= 0 && (
        <span className="flex items-center gap-1.5" title={`Blocks are about ${Math.round((data.blockTimeSec ?? 180) / 60)} min apart`}>
          <Boxes className="h-3 w-3" />
          <span className="num text-foreground/80">#{data.height.toLocaleString()}</span>
          {ago !== null && <span className="num hidden md:inline">· {ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m ${ago % 60}s`} ago</span>}
        </span>
      )}

      <span className="ml-auto flex items-center gap-4">
        {slot === 'test' && <span className="hidden text-warn lg:inline">Test tokens have no value</span>}
        <a href={apiBase} target="_blank" rel="noopener noreferrer" className="num hover:text-foreground">
          API: {apiBase}
        </a>
        <a href="https://github.com/qrdx-org/qrdx-trade/blob/main/docs/API.md" target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1 hover:text-foreground md:flex">
          <BookOpen className="h-3 w-3" /> Docs
        </a>
        <a href={network.explorerUrl} target="_blank" rel="noopener noreferrer" className="hidden hover:text-foreground md:inline">
          Explorer
        </a>
        <a href="https://github.com/qrdx-org" target="_blank" rel="noopener noreferrer" className="hidden hover:text-foreground md:inline" aria-label="GitHub">
          <Github className="h-3 w-3" />
        </a>
      </span>
    </div>
  )
}

/** When this page first saw the chain at its current height. */
function useBlockSeen(height: number | null): number | null {
  const last = useRef<number | null>(null)
  const [at, setAt] = useState<number | null>(null)
  useEffect(() => {
    if (height === null) return
    if (last.current !== height) {
      // The first reading is not a new block: we do not know when it was made.
      if (last.current !== null) setAt(Date.now())
      last.current = height
    }
  }, [height])
  return at
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
