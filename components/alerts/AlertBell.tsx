'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, X } from 'lucide-react'
import { addAlert, onAlertsChange, readAlerts, removeAlert, type PriceAlert } from '@/lib/alerts'
import { price as fmtPrice } from '@/lib/format'
import { useNet } from '@/lib/wallet/WalletContext'
import { cn } from '@/lib/utils'

/**
 * Set a price alert on this market (lib/alerts.ts): above or below a price in the market's
 * quote units. Asks for notification permission when the first one is set.
 */
export function AlertBell({ path, label, unit, priceRaw }: { path: string; label: string; unit: string; priceRaw: string | null }) {
  const { slot } = useNet()
  const [open, setOpen] = useState(false)
  // Rendered only once the market has loaded in the browser, so storage can be read up front.
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => (typeof window === 'undefined' ? [] : readAlerts()))
  const [direction, setDirection] = useState<'above' | 'below'>('above')
  const [price, setPrice] = useState('')
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => onAlertsChange(() => setAlerts(readAlerts())), [])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const mine = alerts.filter((a) => a.path === path && a.slot === slot)
  const valid = /^\d*\.?\d+$/.test(price) && Number(price) > 0
  const add = async () => {
    if (!valid) return
    addAlert({ path, label, slot, direction, price })
    setPrice('')
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') setPermission(await Notification.requestPermission().catch(() => 'default' as const))
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (!open && priceRaw && !price) {
            setPrice(String(Number(Number(priceRaw).toPrecision(6))))
          }
          setOpen(!open)
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={mine.length ? `Price alerts (${mine.length})` : 'Set a price alert'}
        title={mine.length ? `${mine.length} price alert${mine.length === 1 ? '' : 's'}` : 'Set a price alert'}
        aria-expanded={open}
      >
        {mine.length ? <BellRing className="h-4 w-4 text-foreground" /> : <Bell className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-40 w-72 rounded-lg border bg-popover p-3 text-xs shadow-xl" role="dialog" aria-label="Price alerts">
          <p className="mb-2 font-semibold">Alert on {label}</p>
          <div className="mb-2 flex gap-1">
            {(['above', 'below'] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)} className={cn('flex-1 rounded-md border py-1 capitalize', direction === d ? 'border-foreground bg-accent font-medium' : 'text-muted-foreground')}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              aria-label={`Alert price in ${unit}`}
              placeholder={`Price in ${unit}`}
              className="num h-8 min-w-0 flex-1 rounded-md border bg-background px-2"
            />
            <button type="button" onClick={() => void add()} disabled={!valid} className="h-8 rounded-md bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">
              Add
            </button>
          </div>
          {priceRaw && <p className="mt-1 text-[10px] text-muted-foreground">Now {fmtPrice(priceRaw)} {unit}</p>}
          {mine.length > 0 && (
            <ul className="mt-2 space-y-1 border-t pt-2">
              {mine.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span className="num">
                    {a.direction} {fmtPrice(a.price)} {unit}
                  </span>
                  <button type="button" onClick={() => removeAlert(a.id)} aria-label="Remove alert" className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {permission === 'denied'
              ? 'Notifications are blocked for this site, so alerts show on the page only.'
              : permission === 'unsupported'
                ? 'This browser cannot show notifications; alerts show on the page.'
                : 'Checked while a QRDX Trade tab is open. An alert fires once.'}
          </p>
        </div>
      )}
    </div>
  )
}
