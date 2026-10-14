'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { apiGet } from '@/lib/hooks/useApi'
import { useNodeStream } from '@/lib/hooks/useNodeStream'
import { crossed, notify, onAlertsChange, readAlerts, writeAlerts } from '@/lib/alerts'
import { price as fmtPrice, size as fmtSize } from '@/lib/format'
import type { AccountResponse, MarketsResponse } from '@/lib/types'
import { useNet, useWallet } from '@/lib/wallet/WalletContext'

interface Toast {
  id: string
  title: string
  body: string
}

const PRICE_EVERY_MS = 15_000

/**
 * Runs on every trading page: checks the price alerts against the markets' prices, and tells
 * the connected account when one of its resting orders fills. A system notification when the
 * browser allows them, a note on the page either way.
 */
export function AlertWatcher() {
  const { apiBase, slot, network } = useNet()
  const w = useWallet()
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast = (t: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((list) => [...list.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 12_000)
  }
  const say = (title: string, body: string, tag: string) => {
    notify(title, body, tag)
    toast({ title, body })
  }

  // ── Price alerts ──
  const [watching, setWatching] = useState(() => (typeof window === 'undefined' ? false : readAlerts().some((a) => a.slot === slot)))
  useEffect(() => onAlertsChange(() => setWatching(readAlerts().some((a) => a.slot === slot))), [slot])
  useEffect(() => {
    if (!watching) return
    let live = true
    const check = async () => {
      if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined' && Notification.permission !== 'granted') return
      const { data } = await apiGet<MarketsResponse>(`${apiBase}/markets`).catch(() => ({ data: null }))
      if (!live || !data) return
      const prices = new Map<string, string>()
      for (const m of data.spot) if (m.last) prices.set(m.path, m.last)
      for (const m of data.perps) if (m.markPrice) prices.set(m.path, m.markPrice)
      const all = readAlerts()
      const hit = crossed(all.filter((a) => a.slot === slot), prices)
      if (!hit.length) return
      writeAlerts(all.filter((a) => !hit.includes(a)))
      for (const a of hit) say(`${a.label} is ${a.direction} ${fmtPrice(a.price)}`, `Now ${fmtPrice(prices.get(a.path)!)}. This alert is now removed.`, `alert-${a.id}`)
    }
    void check()
    const t = setInterval(check, PRICE_EVERY_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [watching, apiBase, slot]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fills of the account's resting orders ──
  const filled = useRef<Map<string, string> | null>(null)
  const [tick, setTick] = useState(0)
  useNodeStream(network.nodeUrl, [w.trader && `spot_account:${w.trader}`, w.trader && `perp_account:${w.trader}`], () => setTick((n) => n + 1), 1_000)
  useEffect(() => {
    filled.current = null
  }, [w.trader, slot])
  useEffect(() => {
    if (!w.trader) return
    let live = true
    apiGet<AccountResponse>(`${apiBase}/accounts/${w.trader}`)
      .then(({ data }) => {
        if (!live) return
        const now = new Map<string, string>()
        for (const o of data.spotOrders) now.set(`s:${o.orderId}`, o.filled)
        for (const o of data.perp?.orders ?? []) now.set(`p:${o.order_id}`, o.filled)
        const before = filled.current
        filled.current = now
        if (!before) return
        for (const o of data.spotOrders) {
          const was = before.get(`s:${o.orderId}`)
          if (was != null && Number(o.filled) > Number(was))
            say(`Order filled: ${o.side} ${o.base.symbol}`, `${fmtSize(o.filled)} of ${fmtSize(o.amount)} ${o.base.symbol} at ${fmtPrice(o.price)} ${o.quote.symbol}`, `fill-${o.orderId}`)
        }
        for (const o of data.perp?.orders ?? []) {
          const was = before.get(`p:${o.order_id}`)
          if (was != null && Number(o.filled) > Number(was))
            say(`Order filled: ${o.side === 'buy' ? 'long' : 'short'} ${o.market_id}`, `${fmtSize(o.filled)} of ${fmtSize(o.size)} at ${fmtPrice(o.price)}`, `fill-${o.order_id}`)
        }
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [w.trader, apiBase, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed bottom-10 right-3 z-50 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-2 rounded-lg border bg-popover p-3 text-xs shadow-xl">
          <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t.title}</p>
            <p className="text-muted-foreground">{t.body}</p>
          </div>
          <button type="button" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
