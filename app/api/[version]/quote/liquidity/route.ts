import { ApiError, handler, json, options } from '@/lib/server/http'
import { liquidityQuote } from '@/lib/server/accounts'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

const DEC = /^\d+(\.\d+)?$/

export const GET = handler(async (req, { params }: { params: Promise<{ version: string }> }) => {
  const net = netFromVersion((await params).version)
  const p = new URL(req.url).searchParams
  const pool = p.get('pool')
  const lower = Number(p.get('tickLower'))
  const upper = Number(p.get('tickUpper'))
  if (!pool || !Number.isInteger(lower) || !Number.isInteger(upper)) {
    throw new ApiError('bad_request', 'pool, tickLower and tickUpper (integers) are required')
  }
  const amounts: { liquidity?: string; amount0?: string; amount1?: string } = {}
  for (const k of ['liquidity', 'amount0', 'amount1'] as const) {
    const v = p.get(k)
    if (v === null || v === '') continue
    if (!DEC.test(v)) throw new ApiError('bad_request', `${k} must be a decimal`)
    amounts[k] = v
  }
  return json(await liquidityQuote(net, pool, lower, upper, amounts), 1)
})
export const OPTIONS = options
