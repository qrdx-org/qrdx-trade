# QRDX Trade

The trading frontend for the QRDX chain's native exchange, at `trade.qrdx.org`:
spot order books, AMM swaps, liquidity pools and perpetuals in one dense,
Hyperliquid-style screen, plus a public market-data API at
`trade.qrdx.org/api/v1`.

The site holds no keys and matches nothing. Orders are matched and settled by
the chain; signatures come from the [QRDX Wallet](../qrdx-wallet) extension.
Order books, quotes, pool prices and balances come only from a QRDX node;
public exchanges (Coinbase, Kraken, CoinGecko) supply labelled USD index prices
and reference charts.

- Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- API reference: [docs/API.md](docs/API.md)

## URLs

| Path | |
|---|---|
| `/trade` | markets |
| `/trade/{base}/{quote}` | spot pair, e.g. `/trade/qrdx/btc`, `/trade/eth/usdc` |
| `/trade/{base}` | redirects to the base's default pair |
| `/trade/0x…/usdc` | an unverified token trades by its address |
| `/perps/{base}/{quote}` | perpetual, e.g. `/perps/btc/usd` |
| `/launch` | launch a community coin (token + pool + launch curve), and the feed of new ones |
| `/swap`, `/pools`, `/pools/{id}`, `/pools/new`, `/portfolio` | |
| `/api/v1/…` | public read-only API, mainnet |
| `/api/v1-test/…` | the same API for testnet |

The pages follow the connected wallet's network: put the QRDX Wallet on testnet
and the site shows testnet. Without a wallet, use the Mainnet / Testnet switch in
the nav or `?network=testnet`.

Verified assets (slugs) are listed in `lib/assets.ts`.

## Connecting a wallet

**Connect** offers two ways in:

- **QRDX Wallet extension** in this browser.
- **QRDX Wallet on your phone**: scan the QR code with the wallet (Connect to a
  site), and approve orders on the phone. This is QRDX Connect, an end-to-end
  encrypted link through a relay at `/api/relay`: see
  [docs/CONNECT.md](docs/CONNECT.md).

## Development

```bash
pnpm install
cp .env.example .env.local        # pick the network
pnpm dev
```

To develop without a public node, run the local exchange node (qrdx-node's real
exchange engine, seeded with markets) and point the site at it:

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/local-node/requirements.txt
BLOCK_SECONDS=8 PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/local-node/node_harness.py
NEXT_PUBLIC_QRDX_TEST_NETWORK=local pnpm dev   # the local node serves as "testnet"
```

Load the QRDX Wallet extension (`cd ../qrdx-wallet && pnpm extension:build`,
then load `dist/chrome` unpacked) to trade. The local node's faucet funds an
account: `curl -X POST localhost:3007/faucet -d '{"address":"0xPQ…"}'`.

| Script | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm test` | unit tests (vitest) |
| `pnpm typecheck` | TypeScript |
| `node tests/e2e/trade-wallet.mjs` | wallet extension + site + local node, end to end (see the file header) |
| `node tests/e2e/trade-phone.mjs` | phone wallet + relay + site + local node, end to end (see the file header) |
| `pnpm relay:dev` / `pnpm relay:deploy` | the QRDX Connect relay on its own (Cloudflare Worker + Durable Object) |
| `pnpm build:worker` | Pages build (next-on-pages), then deploys the QRDX Connect relay when Cloudflare credentials are present (docs/CONNECT.md) |
| `pnpm deploy` | the above, then `wrangler pages deploy` |

## Configuration

| Variable | |
|---|---|
| `NEXT_PUBLIC_QRDX_MAIN_NETWORK` | network behind `/api/v1` (default `mainnet`) |
| `NEXT_PUBLIC_QRDX_TEST_NETWORK` | network behind `/api/v1-test` (default `testnet`; `local` for development) |
| `QRDX_{MAIN,TEST}_RPC_URL` | node JSON-RPC endpoint (default per network) |
| `QRDX_{MAIN,TEST}_NODE_URL` | node REST base, for block history (default per network) |
| `QRDX_{MAIN,TEST}_VERIFIED_ISSUERS` | comma-separated creator addresses whose tokens count as the verified assets |
| `QRDX_{MAIN,TEST}_ASSET_ADDRESSES` | JSON `{"btc": "0x…"}` pinning verified assets to token addresses |
| `NEXT_PUBLIC_QRDX_RELAY_URL` | QRDX Connect relay (default: this site's `/api/relay`) |
| `NEXT_PUBLIC_QRDX_WALLET_URL` | where pairing links open the wallet (default `https://wallet.qrdx.org`) |

On `local` with no issuers set, tokens match verified assets by symbol alone.
Never run a public deployment that way.
