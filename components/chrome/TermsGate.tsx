'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PRIVACY_URL, TERMS_URL, acceptTerms, termsAccepted } from '@/lib/terms'

const LINK = 'text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground'

const CHECKS = [
  {
    id: 'terms',
    label: (
      <>
        I have read and agree to the{' '}
        <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
          Terms of Service
        </a>{' '}
        and the{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
          Privacy Policy
        </a>
        .
      </>
    ),
  },
  {
    id: 'eligible',
    label: <>I am not subject to sanctions, I am not in a country or region under comprehensive sanctions, and using QRDX Trade is lawful where I am.</>,
  },
  {
    id: 'risk',
    label: (
      <>
        I trade at my own risk. Transactions are final, a leveraged position can be liquidated and lose all of its margin, and nobody can reverse a trade or
        recover a lost recovery phrase.
      </>
    ),
  },
]

/**
 * Asks a new visitor to accept the Terms before using the site, once per browser and
 * again when the Terms change (lib/terms.ts). It cannot be dismissed any other way.
 */
export function TermsGate() {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  // Read after mount: the server render cannot know what this browser accepted.
  useEffect(() => setOpen(!termsAccepted()), [])
  const all = CHECKS.every((c) => checked[c.id])

  return (
    <Dialog open={open}>
      <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className="max-w-md gap-0 p-0">
        <div className="border-b px-6 pb-4 pt-6">
          <DialogTitle className="text-base">Before you use QRDX Trade</DialogTitle>
          <DialogDescription className="mt-2 text-[13px] leading-relaxed">
            QRDX Trade is software for the exchange built into the QRDX chain. It never holds your funds or keys: your wallet signs every order. Mainnet has not launched, and testnet tokens have no value.
          </DialogDescription>
        </div>
        <ul className="space-y-3 px-6 py-5">
          {CHECKS.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer gap-3 text-[13px] leading-relaxed text-muted-foreground">
                <input type="checkbox" checked={!!checked[c.id]} onChange={(e) => setChecked((s) => ({ ...s, [c.id]: e.target.checked }))} className="mt-[3px] h-4 w-4 shrink-0 accent-primary" />
                <span>{c.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <a href="https://qrdx.org" className="text-center text-xs text-muted-foreground hover:text-foreground">
            Leave
          </a>
          <Button
            disabled={!all}
            onClick={() => {
              acceptTerms()
              setOpen(false)
            }}
          >
            Accept and continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
