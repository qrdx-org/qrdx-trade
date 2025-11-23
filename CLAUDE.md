# QRDX Trade - Development Guide

## Project Overview

QRDX Trade is a Next.js 16 application that provides a trading interface for quantum-resistant cryptocurrency assets. The project uses modern web technologies and follows best practices for performance and maintainability.

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5.7
- **Styling**: Tailwind CSS v4 with custom CSS variables
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: React hooks (client-side state)
- **Package Manager**: pnpm 10.6.4

### Directory Structure

```
qrdx-trade/
├── app/                    # Next.js App Router
│   ├── globals.css        # Global styles and Tailwind
│   ├── layout.tsx         # Root layout with theme provider
│   └── page.tsx           # Main trading page
├── components/            # React components
│   ├── ui/               # shadcn/ui primitives
│   │   ├── button.tsx
│   │   └── card.tsx
│   ├── Footer.tsx        # Footer component
│   ├── Navigation.tsx    # Navigation bar with mobile menu
│   ├── theme-provider.tsx # Theme context provider
│   └── theme-toggle.tsx  # Dark mode toggle
├── lib/                  # Utility functions
│   └── utils.ts         # cn() helper for className merging
├── public/              # Static assets
├── .env.example         # Environment variables template
├── components.json      # shadcn/ui configuration
├── next.config.mjs      # Next.js configuration
├── package.json         # Dependencies and scripts
├── postcss.config.js    # PostCSS configuration
├── tailwind.config.js   # Tailwind CSS configuration
└── tsconfig.json        # TypeScript configuration
```

## Key Features

### 1. Trading Interface
- Token swap component with "From" and "To" fields
- Market information display (price, volume, liquidity, fees)
- Recent trades view (requires wallet connection)

### 2. Theme Support
- Light and dark mode with system preference detection
- Smooth transitions between themes
- CSS variables for consistent theming

### 3. Responsive Design
- Mobile-first approach
- Collapsible mobile navigation
- Adaptive layouts for different screen sizes

## Development Workflow

### Getting Started

```bash
# Install dependencies
pnpm install

# Run development server (with Turbopack)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Adding New Components

Use shadcn/ui CLI to add pre-built components:

```bash
npx shadcn@latest add [component-name]
```

Available components: button, card, dialog, tabs, tooltip, etc.

### Code Standards

1. **TypeScript**: Use strict typing, avoid `any`
2. **Components**: Use functional components with hooks
3. **Styling**: Use Tailwind CSS utilities, avoid inline styles
4. **File naming**: 
   - Components: PascalCase (e.g., `Navigation.tsx`)
   - Utilities: camelCase (e.g., `utils.ts`)
   - Pages: lowercase (e.g., `page.tsx`)

## Configuration

### Environment Variables

Create `.env.local` for local development:

```env
NEXT_PUBLIC_API_URL=https://api.qrdx.org
NEXT_PUBLIC_CHAIN_ID=1
NEXT_PUBLIC_SOURCE_MAPS=false
```

### Next.js Configuration

- Static export for production (`output: 'export'`)
- Image optimization disabled for static hosting
- Package import optimizations for lucide-react
- Server Components HMR caching enabled

### Tailwind Configuration

- Custom color system using CSS variables
- Dark mode support via class strategy
- shadcn/ui design tokens
- Typography plugin for markdown content

## Building and Deployment

### Production Build

```bash
# Standard build
pnpm build

# Build without Bun runtime
pnpm build:nobun
```

Output: `out/` directory (static files)

### Deployment Options

1. **Static Hosting** (Vercel, Netlify, Cloudflare Pages)
   - Simply deploy the `out/` folder
   - No server required

2. **Custom Server**
   - Use `pnpm start` after build
   - Requires Node.js runtime

## Key Implementation Details

### Theme System

The theme is implemented using:
1. `next-themes` for theme management
2. CSS variables in `globals.css`
3. `ThemeProvider` in root layout
4. `ThemeToggle` component for switching

### Component Architecture

- **Server Components**: Default for better performance
- **Client Components**: Used when interactivity is needed (marked with `'use client'`)
- **Radix UI**: Accessible, unstyled primitives
- **Class Variance Authority**: Type-safe variant management

### Styling Approach

```tsx
// Use cn() utility to merge classes
import { cn } from "@/lib/utils"

<div className={cn("base-class", conditional && "conditional-class")}>
```

## Future Enhancements

- [ ] Integrate wallet connection (WalletConnect, MetaMask)
- [ ] Add real-time price feeds
- [ ] Implement order book display
- [ ] Add trading chart visualization
- [ ] Create liquidity pool management
- [ ] Add transaction history
- [ ] Implement user portfolio view

## Troubleshooting

### Common Issues

1. **Build Errors**: Run `pnpm clean` then reinstall
2. **Type Errors**: Ensure all dependencies are installed
3. **Style Issues**: Check Tailwind purge configuration
4. **Theme Not Working**: Verify `suppressHydrationWarning` on `<html>`

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com)

## Support

For questions or issues:
- Check documentation at https://docs.qrdx.org
- Open an issue on GitHub
- Join the Discord community
