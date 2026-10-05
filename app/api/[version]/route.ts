import { handler, json, options } from '@/lib/server/http'
import { netFromVersion } from '@/lib/server/net'

export const runtime = 'edge'

export const GET = handler(async (_req, { params }: { params: Promise<{ version: string }> }) => {
  const { version } = await params
  const cfg = netFromVersion(version).cfg
  return json(
    {
      name: 'QRDX Trade API',
      version,
      network: cfg.id,
      networkName: cfg.name,
      chainId: cfg.chainId,
      node: cfg.nodeUrl,
      docs: 'https://github.com/qrdx-org/qrdx-trade/blob/main/docs/API.md',
      networks: { mainnet: '/api/v1', testnet: '/api/v1-test' },
      endpoints: [
        `/api/${version}/assets`,
        `/api/${version}/assets/{asset}`,
        `/api/${version}/markets`,
        `/api/${version}/markets/{base}`,
        `/api/${version}/markets/{base}/{quote}`,
        `/api/${version}/markets/{base}/{quote}/orderbook`,
        `/api/${version}/markets/{base}/{quote}/trades`,
        `/api/${version}/markets/{base}/{quote}/candles`,
        `/api/${version}/perps`,
        `/api/${version}/perps/{base}/{quote}`,
        `/api/${version}/perps/{base}/{quote}/orderbook`,
        `/api/${version}/perps/{base}/{quote}/trades`,
        `/api/${version}/perps/{base}/{quote}/candles`,
        `/api/${version}/pools`,
        `/api/${version}/pools/{poolId}`,
        `/api/${version}/quote`,
        `/api/${version}/quote/liquidity`,
        `/api/${version}/accounts/{address}`,
        `/api/${version}/receipts/{txHash}`,
        `/api/${version}/prices`,
        `/api/${version}/launches`,
      ],
    },
    60
  )
})
export const OPTIONS = options
