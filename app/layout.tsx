import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { WalletProvider } from '@/lib/wallet/WalletContext'
import { StaleBuildGuard } from '@/components/StaleBuildGuard'
import { TermsGate } from '@/components/chrome/TermsGate'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'QRDX Trade',
  description: 'Spot order books, swaps, liquidity pools and perpetuals on the QRDX chain, every order signed with a post-quantum key.',
  keywords: ['QRDX', 'post-quantum', 'ML-DSA', 'order book', 'perpetuals', 'swap', 'liquidity pools', 'decentralized exchange'],
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
    title: 'QRDX Trade',
    description: 'Spot order books, swaps, liquidity pools and perpetuals on the QRDX chain, every order signed with a post-quantum key.',
    siteName: 'QRDX Trade',
    images: [
      {
        url: 'https://trade.qrdx.org/logo.png',
        width: 1200,
        height: 630,
        alt: 'QRDX Trade',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QRDX Trade',
    description: 'Spot order books, swaps, liquidity pools and perpetuals on the QRDX chain, every order signed with a post-quantum key.',
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
      <body className={`${inter.className} ${inter.variable} ${mono.variable}`}>
        <StaleBuildGuard />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <WalletProvider>
            {children}
            <TermsGate />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
