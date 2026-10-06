'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** Starred markets (paths like /trade/qrdx/btc), per browser. Every component sees one list. */
const KEY = 'qrdx-trade:favorites'
const listeners = new Set<() => void>()
let cache: string[] | null = null

function read(): string[] {
  if (cache) return cache
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    cache = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    cache = []
  }
  return cache
}

function write(next: string[]) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: favourites last for this page only */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null
      l()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}
const EMPTY: string[] = []

export function useFavorites() {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY)
  const toggle = useCallback((path: string) => {
    const cur = read()
    write(cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path])
  }, [])
  const has = useCallback((path: string) => list.includes(path), [list])
  return { list, has, toggle }
}
