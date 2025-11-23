# QRDX Trade - Quantum-Resistant DEX Trading Platform

A professional, production-ready trading platform built with Next.js 16, featuring quantum-resistant security for the post-quantum era.

## 🌟 Features

### Core Trading Functionality
- **Live Trading Charts** - Real-time price charts with multiple timeframes (1H, 1D, 1W, 1M, 1Y)
- **Advanced Swap Interface** - Professional token swap UI with slippage control
- **Order Book** - Live order book with bid/ask spreads and depth visualization
- **Trade History** - Real-time trade feed showing recent market activity
- **Market Statistics** - Comprehensive platform metrics including TVL, volume, and active users

### Dual Wallet Support
- **Web3 Wallets** - Support for standard Ethereum wallets (MetaMask, WalletConnect, etc.)
- **QRDX Wallets** - Native quantum-resistant QRDX chain wallets

### Professional UI/UX
- 🎨 Modern, Uniswap/Binance-inspired design
- 📊 Interactive charts with Recharts
- ✨ Smooth Framer Motion animations
- 🌓 Light/Dark mode support
- 📱 Fully responsive mobile-first design
- ⚡ Lightning-fast performance

### Security
- 🛡️ Quantum-resistant cryptography
- 🔒 Post-quantum secure transactions
- ✅ Audited smart contracts (coming soon)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ or Bun
- pnpm (recommended), npm, or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/qrdx-org/qrdx-trade.git
cd qrdx-trade

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 📁 Project Structure

```
qrdx-trade/
├── app/                    # Next.js 16 app directory
│   ├── page.tsx           # Main trading page
│   ├── pools/             # Liquidity pools
│   ├── stake/             # Staking interface
│   ├── analytics/         # Analytics dashboard
│   └── globals.css        # Global styles
├── components/
│   ├── TradingChart.tsx   # Live price chart
│   ├── SwapInterface.tsx  # Token swap UI
│   ├── OrderBook.tsx      # Order book display
│   ├── TradeHistory.tsx   # Recent trades
│   ├── MarketStats.tsx    # Platform statistics
│   ├── WalletConnect.tsx  # Wallet connection
│   ├── Navigation.tsx     # Main navigation
│   ├── Footer.tsx         # Footer component
│   └── ui/                # Reusable UI components
└── lib/
    └── utils.ts           # Utility functions
```

## 🛠️ Built With

- **[Next.js 16](https://nextjs.org/)** - React framework with App Router
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS
- **[Framer Motion](https://www.framer.com/motion/)** - Animation library
- **[Recharts](https://recharts.org/)** - Charting library
- **[Radix UI](https://www.radix-ui.com/)** - Headless UI components
- **[shadcn/ui](https://ui.shadcn.com/)** - Component library

## 🎯 Key Components

### Trading Chart
Real-time price charts with:
- Multiple timeframe support
- Live price updates
- Percentage change indicators
- Gradient area charts
- Responsive design

### Swap Interface
Professional token swap with:
- Token selection dropdowns
- Amount input validation
- Exchange rate display
- Slippage settings
- Transaction fee estimation
- Minimum received calculation

### Order Book
Live market depth showing:
- Bid/ask spreads
- Order quantity
- Cumulative totals
- Visual depth representation
- Real-time updates

### Wallet Integration
Dual wallet system:
- Web3 wallet connection (Ethereum-compatible)
- QRDX native wallet support
- Address display with copy function
- Connection status indicators

## 🎨 Design Philosophy

The platform follows these design principles:
- **Professional** - Clean, modern interface inspired by Uniswap and Binance
- **Responsive** - Mobile-first design that scales beautifully
- **Interactive** - Smooth animations and transitions throughout
- **Accessible** - Built with accessibility in mind
- **Performance** - Optimized for speed and efficiency

## 📊 Market Statistics

The platform displays comprehensive metrics:
- Total Value Locked (TVL)
- 24-hour trading volume
- Active user count
- Liquidity pool count
- Total trades
- Average APY

## 🔒 Security Features

- Quantum-resistant cryptographic algorithms
- Post-quantum secure key exchange
- Secure transaction signing
- Protected liquidity pools
- Audited smart contracts (planned)

## 🌐 Environment

This project is configured to run in a dev container with:
- Debian GNU/Linux 12 (bookworm)
- Node.js & pnpm
- Git and development tools

## 📝 Development

### Available Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm start        # Start production server
pnpm lint         # Run linting
pnpm clean        # Clean build artifacts
```

### Adding New Features

1. Create component in `/components`
2. Add page in `/app` directory
3. Update navigation if needed
4. Test responsiveness
5. Check dark mode compatibility

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🔗 Links

- **Main Site**: https://qrdx.org
- **Documentation**: https://qrdx.org/docs
- **Whitepaper**: https://qrdx.org/whitepaper
- **Block Explorer**: https://explorer.qrdx.org
- **GitHub**: https://github.com/qrdx-org

## 🙏 Acknowledgments

- Design inspiration from Uniswap and Binance
- Sister project: [qrdx.org](https://qrdx.org)
- Built with love for the quantum-resistant future

---

**QRDX Foundation** - Building the quantum-safe future of DeFi
