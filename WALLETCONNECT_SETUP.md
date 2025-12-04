# WalletConnect Integration - Quick Start

## What Was Added

✅ **WalletConnect v3 (Web3Modal)** - Full integration with 300+ wallet support
✅ **QR Code Scanning** - Connect mobile wallets like Uniswap, Rainbow, Trust Wallet
✅ **Multi-Chain Support** - Ethereum, Arbitrum, Optimism, Polygon, Base
✅ **Wagmi + Viem** - Modern, type-safe Ethereum interactions
✅ **Auto-Detection** - Automatically detects and lists available wallets

## Quick Test

1. **Start the dev server:**
   ```bash
   pnpm dev
   ```

2. **Navigate to Wallets page** (click "Connect Wallet")

3. **Click "WalletConnect" option** - Shows QR code modal

4. **Scan with mobile wallet** or select from desktop wallets

## Files Added/Modified

### New Files
- `lib/walletConfig.ts` - WalletConnect configuration
- `components/Web3ModalProvider.tsx` - Web3Modal provider wrapper
- `docs/WALLETCONNECT.md` - Full documentation
- `.env.example` - Environment variable template

### Modified Files
- `app/layout.tsx` - Added Web3ModalProvider wrapper
- `app/wallets/page.tsx` - Added WalletConnect integration
- `lib/web3Wallets.ts` - Added WalletConnect detection
- `package.json` - Added dependencies
- `README.md` - Updated with WalletConnect info

## New Dependencies

```json
{
  "@web3modal/wagmi": "^5.1.11",
  "wagmi": "^3.1.0",
  "viem": "^2.41.2",
  "@tanstack/react-query": "^5.90.12"
}
```

## Configuration (Optional but Recommended)

Get your free Project ID:
1. Visit https://cloud.walletconnect.com
2. Create project
3. Copy Project ID
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
   ```

## Features

- 🔗 Connect via QR code or desktop
- 📱 Mobile wallet support (Uniswap, Rainbow, Trust, etc.)
- 🦊 MetaMask, Coinbase Wallet, Brave, Rabby
- 🔄 Auto-reconnect on page refresh
- 🌐 Multi-chain switching
- 💾 Session persistence
- 🎨 Theme integration (dark/light mode)
- ✨ Smooth animations

## Usage Flow

1. User clicks "Connect Wallet"
2. Navigates to `/wallets` page
3. Clicks "Connect Wallet" under Web3 Wallets
4. Selects "WalletConnect" option
5. Web3Modal opens with:
   - QR code for mobile scanning
   - List of available desktop wallets
   - Browser extension detection
6. Wallet connects and shows in the list
7. Address displayed in navigation bar

## Testing Without Project ID

The integration works without a project ID (uses default), but for production you should get your own from WalletConnect Cloud for analytics and customization.

## Supported Wallets

**Mobile (via QR):**
- Uniswap Wallet
- Rainbow
- Trust Wallet
- MetaMask Mobile
- Coinbase Wallet
- Zerion
- Argent
- 300+ more

**Desktop:**
- MetaMask
- Coinbase Wallet
- Brave Wallet
- Rabby
- Any injected wallet

## Next Steps

1. Get WalletConnect Project ID (free)
2. Test with your mobile wallet
3. Customize wallet list in `lib/walletConfig.ts`
4. Add more chains if needed
5. Deploy!
