import tokenData from './tokens.json'

// Token mapping for name/address -> slug resolution
interface TokenMapping {
  symbol: string
  name: string
  address: string
  slug: string
  isNative?: boolean
}

// Full token info with market data (stub generated or from API)
export interface TokenInfo extends TokenMapping {
  logo: string
  imageUrl: string
  isNative: boolean
  price: number
  change24h: number
  marketCap: number
  volume24h: number
  stakingApr: number
  isPopular: boolean
}

// Generate stub market data for a token
function generateStubData(token: TokenMapping): TokenInfo {
  const basePrice = Math.random() * 10000 + 1
  const marketCap = basePrice * (Math.random() * 1000000000 + 100000000)
  
  const isNative = token.isNative || token.address === 'native'
  
  // Generate image URL based on whether it's a native token or contract
  const imageUrl = isNative 
    ? `/tokens/${token.symbol.toLowerCase()}.png`
    : `https://explorer.qrdx.org/contracts/${token.address}/image`
  
  // Emoji mapping (kept for backward compatibility)
  const emojiMap: Record<string, string> = {
    'qETH': '💎',
    'qBTC': '₿',
    'USDT': '💵',
    'QRDX': '🔷',
    'qBNB': '💛',
    'qSOL': '☀️',
    'qADA': '🔵',
    'qDOT': '🟣',
    'qLINK': '🔗',
    'qUNI': '🦄'
  }
  
  return {
    ...token,
    isNative,
    logo: emojiMap[token.symbol] || '🪙',
    imageUrl,
    price: parseFloat(basePrice.toFixed(2)),
    change24h: parseFloat((Math.random() * 30 - 15).toFixed(2)),
    marketCap: Math.floor(marketCap),
    volume24h: Math.floor(marketCap * (Math.random() * 0.3 + 0.05)),
    stakingApr: parseFloat((Math.random() * 15 + 2).toFixed(1)),
    isPopular: ['qETH', 'qBTC', 'USDT', 'QRDX', 'qBNB'].includes(token.symbol)
  }
}

// Generate tokens with stub market data
// TODO: Replace with API call to fetch real market data from QRDX Chain
// Example: const response = await fetch(`https://api.qrdxchain.io/v1/tokens/${token.address}/market`)
export const tokens: TokenInfo[] = tokenData.tokens.map(generateStubData)

export function getTokenBySlug(slug: string): TokenInfo | undefined {
  return tokens.find(token => token.slug.toLowerCase() === slug.toLowerCase())
}

export function getTokenByAddress(address: string): TokenInfo | undefined {
  return tokens.find(token => token.address.toLowerCase() === address.toLowerCase())
}

export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
  return tokens.find(token => token.symbol.toLowerCase() === symbol.toLowerCase())
}

export function getAllTokens(): TokenInfo[] {
  return tokens
}

export function formatMarketCap(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

export function formatVolume(value: number): string {
  return formatMarketCap(value)
}
