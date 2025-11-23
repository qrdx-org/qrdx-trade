# QRDX Trade - Quantum Resistant DEX Trading Interface

https://trade.qrdx.org

A professional trading interface for the world's first quantum-resistant decentralized exchange, built with Next.js 16, TypeScript, Tailwind CSS, and shadcn/ui.

## Overview

QRDX Trade (trade.qrdx.org) provides a seamless trading experience for quantum-resistant assets including qETH, qBTC, and other post-quantum cryptographic tokens.

## Features

### Core Functionality
- ✅ **Trading Interface** - Swap tokens with quantum-resistant security
- ✅ **Light/Dark Mode** - Full theme support with system preference detection
- ✅ **Responsive Design** - Mobile-first approach with desktop optimization
- ✅ **Animated UI** - Smooth Framer Motion animations throughout
- ✅ **Real-time Updates** - Live price feeds and order book data

### Pages
1. **Trading** (`/`)
   - Token swap interface
   - Real-time price charts
   - Order book and trade history
   - Liquidity pool information

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix UI)
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) to view the trading interface.

## Project Structure

```
qrdx-trade/
├── app/                 # Next.js app directory
│   ├── globals.css     # Global styles with Tailwind
│   ├── layout.tsx      # Root layout component
│   └── page.tsx        # Trading page
├── components/         # React components
│   ├── ui/            # shadcn/ui components
│   ├── Navigation.tsx # Navigation bar
│   ├── Footer.tsx     # Footer component
│   └── theme-*.tsx    # Theme components
├── lib/               # Utility functions
│   └── utils.ts       # Helper functions
├── public/            # Static assets
├── next.config.mjs    # Next.js configuration
├── tailwind.config.js # Tailwind CSS configuration
└── tsconfig.json      # TypeScript configuration
```

## Configuration

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=https://api.qrdx.org
NEXT_PUBLIC_CHAIN_ID=1
```

### Deployment

This project is optimized for static export:

```bash
pnpm build
```

The output will be in the `out/` directory, ready for deployment to any static hosting service.

## Development

### Adding New Components

Use shadcn/ui CLI to add components:

```bash
npx shadcn@latest add button
npx shadcn@latest add card
```

### Code Style

- Use TypeScript for type safety
- Follow the existing component structure
- Use Tailwind CSS for styling
- Implement responsive design mobile-first

## License

ISC - See LICENSE file for details

## Links

- [QRDX Website](https://qrdx.org)
- [Documentation](https://docs.qrdx.org)
- [GitHub](https://github.com/qrdx-org)

## Support

For issues and questions:
- GitHub Issues: [qrdx-org/qrdx-trade](https://github.com/qrdx-org/qrdx-trade/issues)
- Discord: [QRDX Community](https://discord.gg/qrdx)
