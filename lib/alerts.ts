/**
 * Price alerts, kept in this browser: a market (by its page path), a direction and a price in
 * the market's quote units (USD for perps). The watcher (components/alerts/AlertWatcher.tsx)
 * compares them with the API's last price (spot) or mark price (perps) while a trade.qrdx.org
 * tab is open; there is no server that could check them otherwise. An alert fires once.
 */

export interface PriceAlert {
  id: string
  /** The market page, e.g. "/trade/qrdx/usdc" or "/perps/sol/usd"; also the key the watcher prices by. */
  path: string
  /** "QRDX/USDC", "SOL-USD". */
  label: string
  /** Testnet and mainnet markets share paths. */
  slot: string
  direction: 'above' | 'below'
  price: string
  createdAt: number
}

const KEY = 'qrdx-trade:alerts'
const EVENT = 'qrdx-trade:alerts-changed'

export function readAlerts(): PriceAlert[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(raw)
      ? raw.filter(
          (a): a is PriceAlert =>
            !!a && typeof a.id === 'string' && typeof a.path === 'string' && (a.direction === 'above' || a.direction === 'below') && typeof a.price === 'string' && Number(a.price) > 0
        )
      : []
  } catch {
    return []
  }
}

export function writeAlerts(alerts: PriceAlert[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(alerts))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function onAlertsChange(fn: () => void): () => void {
  const storage = (e: StorageEvent) => e.key === KEY && fn()
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', storage)
  }
}

export function addAlert(alert: Omit<PriceAlert, 'id' | 'createdAt'>): void {
  writeAlerts([...readAlerts(), { ...alert, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() }])
}

export function removeAlert(id: string): void {
  writeAlerts(readAlerts().filter((a) => a.id !== id))
}

/** The alerts the current prices (by market path) have crossed. */
export function crossed(alerts: PriceAlert[], prices: Map<string, string>): PriceAlert[] {
  return alerts.filter((a) => {
    const p = prices.get(a.path)
    if (p == null || !Number.isFinite(Number(p))) return false
    return a.direction === 'above' ? Number(p) >= Number(a.price) : Number(p) <= Number(a.price)
  })
}

/** A system notification when allowed; false when it could not be shown. */
export function notify(title: string, body: string, tag?: string): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  try {
    new Notification(title, { body, tag, icon: '/logo.png' })
    return true
  } catch {
    return false
  }
}
