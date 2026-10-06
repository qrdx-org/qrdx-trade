'use client'

import { useEffect, useState } from 'react'
import { ArrowRightLeft, ShieldCheck, Smartphone, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConnectDialog } from '@/components/wallet/ConnectButton'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/**
 * Wraps an order form. Without a wallet (or on the wrong network) the form stays
 * visible, so you can see what trading here looks like, but frosted and inert
 * under a card that says what to do next.
 */
export function TradeGate({ children, action = 'trade' }: { children: React.ReactNode; action?: string }) {
  const w = useWallet()
  const { network } = useNet()
  const [dialog, setDialog] = useState(false)
  // Close our connect dialog once a wallet is connected.
  useEffect(() => {
    if (w.status === 'connected' && !w.pairing) setDialog(false)
  }, [w.status, w.pairing])
  const detecting = w.status === 'detecting'
  const gate: 'connect' | 'network' | null = detecting ? null : !w.trader ? 'connect' : !w.rightNetwork ? 'network' : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={cn('flex min-h-0 flex-1 flex-col transition-[filter,opacity] duration-300', gate && 'pointer-events-none select-none opacity-50 blur-[5px]')} aria-hidden={!!gate} inert={gate ? true : undefined}>
        {children}
      </div>
      {gate && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-5">
          <div className="glass w-full max-w-[280px] rounded-xl border p-5 text-center shadow-xl shadow-black/10">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border bg-background">
              {gate === 'connect' ? <Wallet className="h-5 w-5 text-primary" /> : <ArrowRightLeft className="h-5 w-5 text-warn" />}
            </div>
            {gate === 'connect' ? (
              <>
                <h3 className="mt-3 text-sm font-semibold">Connect a wallet to {action}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Orders are signed by your QRDX Wallet with a post-quantum key. Nothing leaves it without your approval.
                </p>
                <Button className="mt-4 w-full" onClick={() => setDialog(true)}>
                  <Wallet className="mr-2 h-4 w-4" /> Connect wallet
                </Button>
                <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Extension
                  </span>
                  <span className="flex items-center gap-1">
                    <Smartphone className="h-3 w-3" /> Phone by QR
                  </span>
                </div>
              </>
            ) : (
              <>
                <h3 className="mt-3 text-sm font-semibold">Wrong network</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Your wallet is on {w.chain?.name ?? 'another network'}. This market is on {network.name}.
                </p>
                <Button className="mt-4 w-full" variant="outline" onClick={() => void w.switchNetwork()}>
                  Switch to {network.name}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <ConnectDialog open={dialog} onOpenChange={setDialog} />
    </div>
  )
}
