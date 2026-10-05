import { NextResponse } from 'next/server'

export type ErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'ambiguous_symbol'
  | 'node_unavailable'
  | 'internal'

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  ambiguous_symbol: 404,
  node_unavailable: 502,
  internal: 500,
}

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly extra: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Raised by an asset segment that should be served at another URL (address → slug). */
export class Redirect extends Error {
  constructor(public readonly segment: string, public readonly to: string) {
    super(`${segment} → ${to}`)
    this.name = 'Redirect'
  }
}

const ROUTE_PARAMS = new Set(['version', 'base', 'quote', 'asset', 'address', 'poolId', 'txHash'])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function json(body: unknown, maxAgeSec = 1): NextResponse {
  return NextResponse.json(body, {
    headers: {
      ...CORS,
      'Cache-Control': `public, max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 4}`,
    },
  })
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...err.extra } },
      { status: STATUS[err.code], headers: { ...CORS, 'Cache-Control': 'no-store' } }
    )
  }
  console.error('[api]', err)
  return NextResponse.json(
    { error: { code: 'internal', message: 'Internal error' } },
    { status: 500, headers: CORS }
  )
}

/**
 * Wrap a handler: ApiError → its status, Redirect → 308 to the same path with
 * the segment replaced, anything else → 500.
 */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<NextResponse>) {
  return async (req: Request, ctx: C): Promise<NextResponse> => {
    try {
      return await fn(req, ctx)
    } catch (err) {
      if (err instanceof Redirect) {
        const url = new URL(req.url)
        const parts = url.pathname.split('/')
        url.pathname = parts
          .map((part) => (part.toLowerCase() === err.segment.toLowerCase() ? err.to : part))
          .join('/')
        // Next exposes dynamic segments as query params on req.url; keep them out of Location.
        for (const [k, v] of [...url.searchParams]) {
          if (parts.some((p) => p.toLowerCase() === v.toLowerCase()) && ROUTE_PARAMS.has(k)) {
            url.searchParams.delete(k)
          }
        }
        // Set Location directly: NextResponse.redirect re-adds the route params as a query.
        return new NextResponse(null, { status: 308, headers: { ...CORS, Location: url.pathname + url.search } })
      }
      return errorResponse(err)
    }
  }
}

export function options() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export function intParam(url: URL, name: string, def: number, lo: number, hi: number): number {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return def
  const n = Number(raw)
  if (!Number.isInteger(n)) throw new ApiError('bad_request', `${name} must be an integer`)
  return Math.min(hi, Math.max(lo, n))
}

export const nowSec = () => Math.floor(Date.now() / 1000)
