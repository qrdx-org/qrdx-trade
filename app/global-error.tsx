'use client'

import './globals.css'
import { ErrorRecovery } from '@/components/ErrorRecovery'

/** The root layout itself crashed (a provider): a page of its own, with the same way out. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        <ErrorRecovery error={error} reset={reset} />
      </body>
    </html>
  )
}
