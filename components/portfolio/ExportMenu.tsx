'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { downloadText, toCsv } from '@/lib/csv'
import { nodeGetPaced } from '@/lib/node-fetch'
import type { PnlResponse } from '@/lib/types'
import { useNet } from '@/lib/wallet/WalletContext'

/** A row of the node's transaction index (qrdx-node qrdx/tx_index.py, /get_address_history). */
interface IndexedTx {
  block_height: number
  tx_hash: string
  timestamp: number | null
  op: string | null
  sender: string | null
  target: string | null
  asset: string | null
  amount: string | null
  status: string | null
  fee: string | null
  error: string | null
  detail: Record<string, unknown> | null
  roles?: string[]
}

const PAGE = 500
const MAX_PAGES = 20

/**
 * Downloads for the account: PnL by market (what the portfolio shows), and every exchange
 * operation the account signed or was party to, from the node's transaction index.
 */
export function ExportMenu({ address, pnl }: { address: string; pnl: PnlResponse | null }) {
  const { network, slot } = useNet()
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const stamp = new Date().toISOString().slice(0, 10)
  const short = address.slice(0, 10)

  const exportPnl = () => {
    if (!pnl) return
    downloadText(
      `qrdx-pnl-${slot}-${short}-${stamp}.csv`,
      toCsv(pnl.markets, [
        { header: 'market', value: (m) => m.market },
        { header: 'kind', value: (m) => m.kind },
        { header: 'unit', value: (m) => m.unit },
        { header: 'trades', value: (m) => m.trades },
        { header: 'wins', value: (m) => m.wins },
        { header: 'losses', value: (m) => m.losses },
        { header: 'volume', value: (m) => m.volume },
        { header: 'volume_usd', value: (m) => m.volumeUsd },
        { header: 'realized', value: (m) => m.realized },
        { header: 'realized_usd', value: (m) => m.realizedUsd },
        { header: 'unrealized', value: (m) => m.unrealized },
        { header: 'unrealized_usd', value: (m) => m.unrealizedUsd },
        { header: 'position', value: (m) => m.position },
        { header: 'position_symbol', value: (m) => m.positionSymbol },
        { header: 'avg_cost', value: (m) => m.avgCost },
      ])
    )
    setNote(pnl.window.truncated ? 'PnL covers the trades the node still keeps; older trades are not included.' : null)
  }

  const exportActivity = async () => {
    setBusy('activity')
    setNote(null)
    try {
      const rows: IndexedTx[] = []
      let cursor: string | null = null
      for (let i = 0; i < MAX_PAGES; i++) {
        const url = `${network.nodeUrl}/get_address_history?address=${encodeURIComponent(address)}&kinds=exchange&limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const body = await nodeGetPaced<{ ok?: boolean; result?: { transactions: IndexedTx[]; next_cursor: string | null } }>(url)
        if (!body.ok || !body.result) throw new Error('This node does not serve a transaction index')
        rows.push(...body.result.transactions)
        cursor = body.result.next_cursor
        if (!cursor || body.result.transactions.length < PAGE) break
      }
      downloadText(
        `qrdx-activity-${slot}-${short}-${stamp}.csv`,
        toCsv(rows, [
          { header: 'time_utc', value: (r) => (r.timestamp ? new Date(r.timestamp * 1000).toISOString() : '') },
          { header: 'block', value: (r) => r.block_height },
          { header: 'tx_hash', value: (r) => r.tx_hash },
          { header: 'operation', value: (r) => r.op },
          { header: 'role', value: (r) => (r.roles ?? []).join(' ') },
          { header: 'status', value: (r) => r.status },
          { header: 'asset', value: (r) => r.asset },
          { header: 'amount', value: (r) => r.amount },
          { header: 'target', value: (r) => r.target },
          { header: 'fee_qrdx', value: (r) => r.fee },
          { header: 'error', value: (r) => r.error },
          { header: 'detail_json', value: (r) => (r.detail ? JSON.stringify(r.detail) : '') },
        ])
      )
      setNote(cursor ? `Exported the newest ${rows.length.toLocaleString()} operations; older ones need a narrower export.` : `${rows.length.toLocaleString()} operations exported.`)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button type="button" onClick={exportPnl} disabled={!pnl} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> PnL CSV
        </button>
        <button type="button" onClick={() => void exportActivity()} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Activity CSV
        </button>
      </div>
      {note && <p className="max-w-xs text-right text-[11px] text-muted-foreground">{note}</p>}
    </div>
  )
}
