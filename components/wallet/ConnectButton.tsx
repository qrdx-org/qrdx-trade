'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, ExternalLink, LogOut, Puzzle, Smartphone, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useWallet } from '@/lib/wallet/WalletContext'
import { shortAddress } from '@/lib/assets'
import { cn } from '@/lib/utils'

export const WALLET_INSTALL_URL = 'https://wallet.qrdx.org'

export function ConnectButton({ className }: { className?: string }) {
  const w = useWallet()
  const [dialog, setDialog] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Close the dialog once a wallet is connected.
  useEffect(() => {
    if (w.status === 'connected' && !w.pairing) setDialog(false)
  }, [w.status, w.pairing])

  if (w.status === 'detecting') {
    return (
      <Button size="sm" variant="outline" disabled className={className}>
        <Wallet className="h-4 w-4 mr-2" /> Wallet
      </Button>
    )
  }

  if (w.status !== 'connected' || !w.account) {
    return (
      <>
        <Button size="sm" onClick={() => setDialog(true)} className={className}>
          <Wallet className="h-4 w-4 mr-2" />
          {w.status === 'connecting' && !w.pairing ? 'Check your wallet…' : 'Connect'}
        </Button>
        <ConnectDialog open={dialog} onOpenChange={setDialog} />
      </>
    )
  }

  const pq = w.account.pqAddress
  const remote = w.connection === 'remote'
  const reachable = !remote || w.phone?.peerOnline
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} className={className}>
        <span className={cn('mr-2 h-2 w-2 rounded-full', !w.rightNetwork ? 'bg-warn' : reachable ? 'bg-bid' : 'bg-muted-foreground')} />
        {remote && <Smartphone className="mr-1 h-3.5 w-3.5" />}
        <span className="font-mono text-xs">{shortAddress(pq, 5)}</span>
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border bg-popover p-3 text-sm shadow-lg z-50" onMouseLeave={() => setOpen(false)}>
          <div className="text-xs text-muted-foreground">Trading account (post-quantum)</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xs break-all">{pq}</span>
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Copy address"
              onClick={() => {
                navigator.clipboard?.writeText(pq)
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Connected through</div>
          <div className="text-xs">
            {remote ? (
              <>
                QRDX Wallet on your phone ·{' '}
                <span className={reachable ? 'text-bid' : 'text-warn'}>{reachable ? 'online' : 'app closed'}</span>
              </>
            ) : (
              'QRDX Wallet extension'
            )}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Wallet network</div>
          <div className="text-xs">{w.chain?.name ?? 'unknown'}</div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" asChild>
              <a href="/portfolio">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Portfolio
              </a>
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => w.disconnect()}>
              <LogOut className="h-3.5 w-3.5 mr-1" /> Disconnect
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Extension, or QRDX Wallet on a phone through a QR code (QRDX Connect, docs/CONNECT.md). */
export function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWallet()
  const [copied, setCopied] = useState(false)
  const close = (o: boolean) => {
    if (!o && w.pairing) w.cancelPairing()
    onOpenChange(o)
  }
  const phoneJoined = !!w.pairing && !!w.phone?.peerOnline

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{w.pairing ? 'Scan with QRDX Wallet' : 'Connect a wallet'}</DialogTitle>
        {w.pairing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={w.pairing} size={232} level="M" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Open QRDX Wallet on your phone and choose <b>Connect to a site</b>, or scan with the camera.
            </p>
            <p className={cn('text-center text-sm', phoneJoined ? 'text-bid' : 'text-muted-foreground')} data-testid="pairing-status">
              {phoneJoined ? 'Phone connected: approve on your phone.' : 'Waiting for your phone…'}
            </p>
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                data-testid="pairing-link"
                data-link={w.pairing}
                onClick={() => {
                  navigator.clipboard?.writeText(w.pairing!)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1200)
                }}
              >
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                Copy link
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => close(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-center text-[10px] leading-snug text-muted-foreground">
              The code holds the key that encrypts this connection. Anyone who scans it can ask your wallet to connect, so keep it
              to yourself; your wallet still asks before sharing anything or signing.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Option
              icon={<Smartphone className="h-5 w-5" />}
              title="QRDX Wallet on your phone"
              detail="Scan a QR code with the app on your phone. You approve each order there."
              onClick={() => void w.connectPhone()}
              testId="connect-phone"
            />
            {w.extension ? (
              <Option icon={<Puzzle className="h-5 w-5" />} title="QRDX Wallet extension" detail="In this browser." onClick={() => void w.connect()} testId="connect-extension" />
            ) : (
              <a href={WALLET_INSTALL_URL} target="_blank" rel="noopener noreferrer" className="block">
                <Option icon={<Puzzle className="h-5 w-5" />} title="Get the browser extension" detail="QRDX Wallet for Chrome and Firefox." />
              </a>
            )}
            {w.error && <p className="text-xs text-ask">{w.error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Option({ icon, title, detail, onClick, testId }: { icon: React.ReactNode; title: string; detail: string; onClick?: () => void; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent">
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}
