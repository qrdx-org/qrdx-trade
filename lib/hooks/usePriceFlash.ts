'use client'

import { useEffect, useRef, useState } from 'react'

/** 'flash-up' / 'flash-down' for a moment after `value` rises or falls; '' otherwise. */
export function usePriceFlash(value: string | null | undefined): string {
  const prev = useRef<number | null>(null)
  const [cls, setCls] = useState('')
  useEffect(() => {
    const n = value == null ? null : Number(value)
    if (n !== null && prev.current !== null && n !== prev.current) {
      setCls(n > prev.current ? 'flash-up' : 'flash-down')
      const t = setTimeout(() => setCls(''), 900)
      prev.current = n
      return () => clearTimeout(t)
    }
    prev.current = n
  }, [value])
  return cls
}
