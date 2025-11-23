import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QRDX Trade - Quantum Resistant DEX Trading',
  description: 'Trade quantum-resistant crypto assets with post-quantum cryptography. Swap qETH, qBTC and other quantum-safe tokens on the first quantum-resistant decentralized exchange.',
  keywords: ['quantum resistant', 'quantum safe', 'post-quantum cryptography', 'DEX', 'decentralized exchange', 'trading', 'swap', 'qETH', 'qBTC', 'DeFi', 'CRYSTALS-Dilithium', 'CRYSTALS-Kyber'],
  authors: [{ name: 'QRDX Foundation' }],
  creator: 'QRDX Foundation',
  publisher: 'QRDX Foundation',
  icons: {
    icon: '/logo.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://trade.qrdx.org',
    title: 'QRDX Trade - Quantum Resistant DEX Trading',
    description: 'Trade quantum-resistant crypto assets with post-quantum cryptography. Swap qETH, qBTC and other quantum-safe tokens.',
    siteName: 'QRDX Trade',
    images: [
      {
        url: 'https://trade.qrdx.org/logo.png',
        width: 1200,
        height: 630,
        alt: 'QRDX Trade - Quantum Resistant DEX',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QRDX Trade - Quantum Resistant DEX Trading',
    description: 'Trade quantum-resistant crypto assets with post-quantum cryptography. Swap qETH, qBTC and other quantum-safe tokens.',
    images: ['https://trade.qrdx.org/logo.png'],
    creator: '@qrdx_org',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
