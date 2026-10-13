'use client'

import { useEffect } from 'react'
import { isStaleBuild, reloadForStaleBuild } from '@/lib/recovery'

/**
 * A chunk that fails to load during client-side navigation (a deploy replaced it) does not
 * always reach an error boundary; it surfaces as an unhandled error or rejection. Reload
 * once, as the error screens do, instead of leaving a dead page.
 */
export function StaleBuildGuard() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => isStaleBuild(e.error ?? e.message) && reloadForStaleBuild()
    const onRejection = (e: PromiseRejectionEvent) => isStaleBuild(e.reason) && reloadForStaleBuild()
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
