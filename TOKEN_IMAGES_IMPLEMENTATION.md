# Token Images Implementation

## Overview
Updated the QRDX Trade application to use actual images instead of emojis for token display. Images are fetched from the QRDX explorer for contract tokens and loaded locally for native tokens.

## Changes Made

### 1. Token Data Structure (`lib/tokens.json`)
- Added `isNative` boolean flag to distinguish between native and contract tokens
- Set QRDX token as native with address "native"
- All other tokens marked as contract tokens (`isNative: false`)

### 2. Token Registry (`lib/tokenRegistry.ts`)
- Updated `TokenInfo` interface to include:
  - `imageUrl`: string - URL to the token image
  - `isNative`: boolean - flag for native tokens
- Modified `generateStubData()` to generate appropriate image URLs:
  - Native tokens: `/tokens/{symbol}.png`
  - Contract tokens: `https://explorer.qrdx.org/contracts/{address}/image`
- Kept emoji mapping for backward compatibility

### 3. New TokenImage Component (`components/TokenImage.tsx`)
Created a reusable component that:
- Accepts `symbol`, `address`, `isNative`, `size`, and `className` props
- Automatically determines correct image source based on token type
- Implements fallback strategy:
  1. Try PNG image
  2. For native tokens, try SVG if PNG fails
  3. Show colored circle with first letter as final fallback
- Supports 4 sizes: sm (20px), md (32px), lg (40px), xl (48px)
- Uses Next.js Image component for optimization
- Handles loading errors gracefully

### 4. Updated Components
Replaced emoji usage with `<TokenImage />` in:
- `components/TokenSelector.tsx` - Token selection dropdown
- `app/page.tsx` - Home page trending tokens
- `app/trade/page.tsx` - Markets listing
- `app/trade/[token]/[quote]/page.tsx` - Trading pair page

### 5. Next.js Configuration (`next.config.mjs`)
- Added remote image pattern for `explorer.qrdx.org`
- Allows loading contract token images from QRDX explorer

### 6. Public Assets
Created `/public/tokens/` directory structure:
- `README.md` - Documentation for adding token images
- `qrdx.svg` - Placeholder SVG for QRDX native token (blue gradient with "Q")

## Image Sources

### Native Tokens
Place images in `/public/tokens/` named as `{symbol}.png` or `{symbol}.svg` (lowercase)
- Example: `qrdx.png` or `qrdx.svg`

### Contract Tokens
Automatically fetched from: `https://explorer.qrdx.org/contracts/{contract_address}/image`

## Usage Example

```tsx
import { TokenImage } from '@/components/TokenImage'

<TokenImage 
  symbol="QRDX"
  address="native"
  isNative={true}
  size="lg"
/>
```

## Fallback Behavior
1. **Primary**: Load image from calculated URL
2. **Secondary** (native tokens only): Try SVG if PNG fails
3. **Final**: Show gradient circle with token's first letter

## Benefits
- Professional appearance with real token logos
- Automatic fallback handling for missing images
- Optimized image loading with Next.js Image component
- Consistent sizing across the application
- Supports both local and remote images
- Graceful degradation when images unavailable
