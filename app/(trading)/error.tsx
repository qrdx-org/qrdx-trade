'use client'

import { ErrorRecovery } from '@/components/ErrorRecovery'

/** A trading page crashed: the nav and status bar stay, the page shows how to recover. */
export default function TradingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorRecovery error={error} reset={reset} />
}
