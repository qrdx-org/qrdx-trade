import { defaultWagmiConfig } from '@web3modal/wagmi'
import { mainnet, arbitrum, optimism, polygon, base } from 'wagmi/chains'

// Get projectId from https://cloud.walletconnect.com
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID'

const metadata = {
  name: 'QRDX Trade',
  description: 'Quantum Resistant DEX Trading Platform',
  url: 'https://trade.qrdx.org',
  icons: ['https://trade.qrdx.org/logo.png']
}

// Create wagmiConfig
export const chains = [mainnet, arbitrum, optimism, polygon, base] as const

export const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  enableAnalytics: true, // Optional - defaults to your Cloud configuration
})
