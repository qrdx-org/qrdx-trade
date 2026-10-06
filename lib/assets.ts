/**
 * The verified asset registry: the major assets that trade under a slug
 * (`/trade/btc/usdc`) instead of a token address. Shared by the API and the UI.
 *
 * An entry says what the asset IS (name, decimals, where to get its USD index
 * price) and how to find its token on a QRDX network. It does not say what the
 * token's address is unless a deployment pins one (QRDX_{MAIN,TEST}_ASSET_ADDRESSES),
 * because native token addresses derive from their deploy transaction
 * (blake2b(sender:nonce:symbol), qrdx-node docs/NATIVE_TOKENS.md). Otherwise a
 * node token is this asset when its on-chain symbol matches AND its creator is
 * one of the network's verified issuers (lib/server/resolve.ts). An entry's
 * `addresses` pins it outright on a network where its token is known.
 *
 * Anything not resolved through this file is unverified and trades by address.
 */

import type { NetworkId } from './config'

export interface PriceIds {
  /** Coinbase Exchange product, e.g. "BTC-USD". */
  coinbase?: string
  /** Kraken pair as requested, e.g. "XBTUSD". */
  kraken?: string
  /** CoinGecko coin id. */
  coingecko?: string
}

export interface VerifiedAsset {
  slug: string
  /** Display ticker. */
  symbol: string
  name: string
  /** The symbol its QRDX token is deployed under (bridged assets are q-prefixed). */
  onChainSymbol: string
  decimals: number
  prices: PriceIds
  /** USD stablecoin: preferred as a quote, and candles against it use the base's USD series. */
  usdStable?: boolean
  /** Quote preference when ordering a pair: higher becomes the quote. 0 = never a default quote. */
  quoteRank: number
  /** Brand colour for the token badge when there is no image. */
  color: string
  /**
   * Known token addresses per network. A deployment's QRDX_{MAIN,TEST}_ASSET_ADDRESSES
   * overrides these; without either, the verified-issuer rule applies.
   */
  addresses?: Partial<Record<NetworkId, string>>
}

export const VERIFIED_ASSETS: VerifiedAsset[] = [
  {
    slug: 'qrdx',
    symbol: 'QRDX',
    name: 'QRDX',
    // Spot trades QRC-20 tokens only, so native QRDX trades as its wrapped token.
    onChainSymbol: 'wQRDX',
    decimals: 18,
    prices: {},
    quoteRank: 60,
    color: '#2563eb',
    addresses: {
      // "Wrapped QRDX" (WQRDX) on test.qrdx.org. A fixed-supply token held by its
      // creator, not yet backed 1:1 by a wrap operation (ARCHITECTURE.md §10).
      testnet: '0xe13ef577f2d8c6cb55e49c70e6ed48f64d0fc106',
    },
  },
  {
    slug: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    onChainSymbol: 'qUSDC',
    decimals: 6,
    prices: { kraken: 'USDCUSD', coingecko: 'usd-coin' },
    usdStable: true,
    quoteRank: 100,
    color: '#2775ca',
  },
  {
    slug: 'usdt',
    symbol: 'USDT',
    name: 'Tether USD',
    onChainSymbol: 'qUSDT',
    decimals: 6,
    prices: { coinbase: 'USDT-USD', kraken: 'USDTUSD', coingecko: 'tether' },
    usdStable: true,
    quoteRank: 90,
    color: '#26a17b',
  },
  {
    slug: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    onChainSymbol: 'qBTC',
    decimals: 8,
    prices: { coinbase: 'BTC-USD', kraken: 'XBTUSD', coingecko: 'bitcoin' },
    quoteRank: 80,
    color: '#f7931a',
  },
  {
    slug: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    onChainSymbol: 'qETH',
    decimals: 18,
    prices: { coinbase: 'ETH-USD', kraken: 'ETHUSD', coingecko: 'ethereum' },
    quoteRank: 70,
    color: '#627eea',
  },
  {
    slug: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    onChainSymbol: 'qSOL',
    decimals: 9,
    prices: { coinbase: 'SOL-USD', kraken: 'SOLUSD', coingecko: 'solana' },
    quoteRank: 0,
    color: '#14f195',
  },
  {
    slug: 'bnb',
    symbol: 'BNB',
    name: 'BNB',
    onChainSymbol: 'qBNB',
    decimals: 18,
    prices: { coinbase: 'BNB-USD', kraken: 'BNBUSD', coingecko: 'binancecoin' },
    quoteRank: 0,
    color: '#f3ba2f',
  },
  {
    slug: 'avax',
    symbol: 'AVAX',
    name: 'Avalanche',
    onChainSymbol: 'qAVAX',
    decimals: 18,
    prices: { coinbase: 'AVAX-USD', kraken: 'AVAXUSD', coingecko: 'avalanche-2' },
    quoteRank: 0,
    color: '#e84142',
  },
  {
    slug: 'link',
    symbol: 'LINK',
    name: 'Chainlink',
    onChainSymbol: 'qLINK',
    decimals: 18,
    prices: { coinbase: 'LINK-USD', kraken: 'LINKUSD', coingecko: 'chainlink' },
    quoteRank: 0,
    color: '#2a5ada',
  },
  {
    slug: 'uni',
    symbol: 'UNI',
    name: 'Uniswap',
    onChainSymbol: 'qUNI',
    decimals: 18,
    prices: { coinbase: 'UNI-USD', kraken: 'UNIUSD', coingecko: 'uniswap' },
    quoteRank: 0,
    color: '#ff007a',
  },
  {
    slug: 'ada',
    symbol: 'ADA',
    name: 'Cardano',
    onChainSymbol: 'qADA',
    decimals: 6,
    prices: { coinbase: 'ADA-USD', kraken: 'ADAUSD', coingecko: 'cardano' },
    quoteRank: 0,
    color: '#0033ad',
  },
  {
    slug: 'dot',
    symbol: 'DOT',
    name: 'Polkadot',
    onChainSymbol: 'qDOT',
    decimals: 10,
    prices: { coinbase: 'DOT-USD', kraken: 'DOTUSD', coingecko: 'polkadot' },
    quoteRank: 0,
    color: '#e6007a',
  },
  {
    slug: 'doge',
    symbol: 'DOGE',
    name: 'Dogecoin',
    onChainSymbol: 'qDOGE',
    decimals: 8,
    prices: { coinbase: 'DOGE-USD', kraken: 'XDGUSD', coingecko: 'dogecoin' },
    quoteRank: 0,
    color: '#c2a633',
  },
]

const BY_SLUG = new Map(VERIFIED_ASSETS.map((a) => [a.slug, a]))

export function verifiedBySlug(slug: string): VerifiedAsset | undefined {
  return BY_SLUG.get(slug.toLowerCase())
}

/** `USD` is a pseudo-asset: perps quote in it and index prices are in it. */
export const USD_SLUG = 'usd'

export const TOKEN_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export const isTokenAddress = (s: string): boolean => TOKEN_ADDRESS_RE.test(s)

/**
 * A resolved pair side: a verified asset (with or without a token on this
 * network) or an unverified token known only by its address.
 */
export interface AssetRef {
  /** URL segment: the slug for verified assets, the address otherwise. */
  segment: string
  slug: string | null
  symbol: string
  name: string
  verified: boolean
  /** Token address on this network, lower-case; null when not listed here. */
  address: string | null
  onChainSymbol: string | null
  decimals: number
  color: string
  quoteRank: number
  usdStable: boolean
}

export function shortAddress(a: string, chars = 4): string {
  return a.length > 2 + chars * 2 ? `${a.slice(0, 2 + chars)}…${a.slice(-chars)}` : a
}

/** A stable colour for an unverified token, from its address. */
export function addressColor(address: string): string {
  let h = 0
  for (let i = 2; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) % 360
  return `hsl(${h} 55% 50%)`
}

/**
 * Which side of a pair should be the quote when nothing else says: the higher
 * quoteRank, then verified over unverified, then the lower address (so the
 * choice is stable).
 */
export function preferredOrder(a: AssetRef, b: AssetRef): [base: AssetRef, quote: AssetRef] {
  if (a.quoteRank !== b.quoteRank) return a.quoteRank > b.quoteRank ? [b, a] : [a, b]
  if (a.verified !== b.verified) return a.verified ? [b, a] : [a, b]
  return (a.address ?? a.segment) < (b.address ?? b.segment) ? [b, a] : [a, b]
}

export const marketPath = (kind: 'spot' | 'perp', base: string, quote: string) =>
  `/${kind === 'spot' ? 'trade' : 'perps'}/${base}/${quote}`
