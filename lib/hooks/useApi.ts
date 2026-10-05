'use client'

/**
 * Polling reads of /api/v1. Each hook instance polls while the tab is visible,
 * keeps the last good value through transient errors, and exposes the error so
 * the UI can say "node unreachable" instead of showing stale data as live.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiErrorBody } from '../types'

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body?: ApiErrorBody['error']
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<{ data: T; redirectedTo: string | null }> {
  const res = await fetch(path, { signal, cache: 'no-store' })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error
    throw new ApiRequestError(res.status, err?.code ?? 'http_error', err?.message ?? `HTTP ${res.status}`, err)
  }
  return { data: body as T, redirectedTo: res.redirected ? new URL(res.url).pathname : null }
}

export interface ApiState<T> {
  data: T | null
  error: ApiRequestError | Error | null
  loading: boolean
  /** The API answered with a redirect (address → slug). */
  redirectedTo: string | null
  refresh: () => void
}

export function useApi<T>(path: string | null, intervalMs = 0): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiRequestError | Error | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [redirectedTo, setRedirected] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const current = useRef(path)

  useEffect(() => {
    current.current = path
    setData(null)
    setError(null)
    setRedirected(null)
    setLoading(!!path)
  }, [path])

  useEffect(() => {
    if (!path) return
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      try {
        const r = await apiGet<T>(path, ctrl.signal)
        if (current.current !== path) return
        setData(r.data)
        setRedirected(r.redirectedTo)
        setError(null)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        if (current.current === path) setError(e as Error)
      } finally {
        if (current.current === path) setLoading(false)
        if (intervalMs > 0 && !ctrl.signal.aborted) {
          timer = setTimeout(() => {
            if (document.visibilityState === 'visible') run()
            else timer = setTimeout(run, intervalMs)
          }, intervalMs)
        }
      }
    }
    run()
    return () => {
      ctrl.abort()
      if (timer) clearTimeout(timer)
    }
  }, [path, intervalMs, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, redirectedTo, refresh }
}

/** Debounce a value (for quote requests as the user types). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
