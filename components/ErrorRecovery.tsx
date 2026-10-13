'use client'

import { useEffect, useState } from 'react'
import { isStaleBuild, reloadForStaleBuild, resetSavedState } from '@/lib/recovery'

/**
 * What a crashed page shows instead of Next's bare "Application error": the error itself
 * (on a phone there is no console to check), and ways out that do not need the browser's
 * data cleared.
 */
export function ErrorRecovery({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [busy, setBusy] = useState(false)
  const stale = isStaleBuild(error)

  useEffect(() => {
    console.error(error)
    if (stale) reloadForStaleBuild()
  }, [error, stale])

  const resetAndReload = async () => {
    setBusy(true)
    await resetSavedState()
    window.location.reload()
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{stale ? 'QRDX Trade was updated' : 'Something went wrong on this page'}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {stale
          ? 'This page still had the previous version. Reloading loads the new one.'
          : 'Try again first. If it keeps happening, reset what this site saved in the browser (the wallet link, the network you picked, tracked transactions and launch progress). Your favourites stay, and nothing in your wallet is touched.'}
      </p>
      <pre className="mt-4 max-h-40 w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 text-left font-mono text-[11px] text-muted-foreground">
        {error.message || String(error)}
        {error.digest ? `\nDigest: ${error.digest}` : ''}
      </pre>
      <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
        <button onClick={() => (stale ? window.location.reload() : reset())} className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
          {stale ? 'Reload' : 'Try again'}
        </button>
        <button onClick={() => void resetAndReload()} disabled={busy} className="h-10 flex-1 rounded-lg border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50">
          {busy ? 'Resetting…' : 'Reset saved settings'}
        </button>
      </div>
    </div>
  )
}
