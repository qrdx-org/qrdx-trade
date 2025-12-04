# WalletConnect Integration

QRDX Trade now supports WalletConnect, allowing users to connect 300+ wallets including Uniswap Wallet, Rainbow, Trust Wallet, and many more through QR code scanning.

## Setup Instructions

### 1. Get a WalletConnect Project ID

1. Visit [WalletConnect Cloud](https://cloud.walletconnect.com)
2. Sign up or log in
3. Create a new project
4. Copy your Project ID

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### 3. Features

- **QR Code Connection**: Scan with mobile wallets
- **Desktop Support**: Connect browser extension wallets
- **Multi-Wallet Support**: Connect multiple wallets simultaneously
- **Chain Switching**: Support for Ethereum, Arbitrum, Optimism, Polygon, and Base
- **Session Persistence**: Wallet connections persist across page refreshes

## Supported Wallets

- **Mobile Wallets**: Uniswap Wallet, Rainbow, Trust Wallet, MetaMask Mobile, Coinbase Wallet, and 300+ more
- **Desktop Wallets**: MetaMask, Coinbase Wallet, Brave Wallet, Rabby
- **Hardware Wallets**: Ledger, Trezor (via WalletConnect)

## How to Connect

1. Click "Connect Wallet" in the navigation
2. Go to the "Wallets" page
3. Click "Connect Wallet" under Web3 Wallets
4. Select "WalletConnect" option
5. Scan the QR code with your mobile wallet app or select from available wallets

## Technical Details

- Built with Web3Modal v3
- Uses Wagmi for Ethereum interactions
- Supports EIP-6963 for multi-wallet injection
- TanStack Query for state management
- TypeScript support with full type safety

## Chains Supported

- Ethereum Mainnet (Chain ID: 1)
- Arbitrum (Chain ID: 42161)
- Optimism (Chain ID: 10)
- Polygon (Chain ID: 137)
- Base (Chain ID: 8453)

## Development

The WalletConnect integration is fully compatible with Next.js App Router and Cloudflare Pages deployment.

For more information, visit:
- [WalletConnect Documentation](https://docs.walletconnect.com/)
- [Web3Modal Documentation](https://docs.walletconnect.com/web3modal/about)
- [Wagmi Documentation](https://wagmi.sh/)
