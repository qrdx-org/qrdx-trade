'use client'

import { ErrorRecovery } from '@/components/ErrorRecovery'

/** A page outside the trading app crashed: show how to recover. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorRecovery error={error} reset={reset} />
}
