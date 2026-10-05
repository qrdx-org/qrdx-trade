# QRDX Trade — Architecture

QRDX Trade (`trade.qrdx.org`) is the trading frontend for the QRDX chain's native
exchange: spot order books, AMM swaps, liquidity pools and perpetuals, in a
Hyperliquid-style interface. It holds no keys and runs no matching engine. Every
order is matched and settled by the chain; every signature comes from the QRDX
Wallet.

```
 browser ──────────────────────────────────────────────────────────────────────────
   trade.qrdx.org pages (React)                     QRDX Wallet extension
     │  reads: /api/v1/*                               window.qrdx / EIP-6963
     │  writes: provider.request(qrdx_sendExchangeTransaction) ──▶ approval window
     ▼                                                   │ signs with ML-DSA-65
 trade.qrdx.org/api/v1  (Next.js route handlers, edge)    │
     │  exchange_* / perp_* JSON-RPC, /get_blocks          ▼
     ├──────────────────────────────────────────────▶  QRDX node  ◀── exchange_sendTransaction
     │  index prices, reference candles
     └──────────────────────────────────────────────▶  Coinbase → Kraken → CoinGecko
```

## 1. Rules for market data

The previous build generated random prices, books and trades. The rules that
replace it:

1. **Order books, swap quotes, pool prices, positions and balances come only from
   the node.** They are what a trade will execute against. Nothing is
   interpolated, padded or invented. An empty book shows as empty.
2. **External prices are reference data, labelled as such.** Public APIs supply
   the USD *index price* of major assets (BTC, ETH, SOL, …) and their candle
   history. They are never shown as a QRDX order book or as a fill.
3. **Every number carries its source.** API responses include `source`
   (`node`, `coinbase`, `kraken`, `coingecko`) and `asOf`. The UI labels index
   prices and shows "node unreachable" rather than stale or fake values.
4. **Prices are decimal strings end to end.** The node's amounts are 18-dp
   decimals. The API passes them through as strings; the UI formats them without
   converting through floating point for anything that gets signed.

### Sources

| Data | Source | Notes |
|---|---|---|
| Spot order book | `exchange_getOrderBook(pair, depth)` | Canonical pair is the address-sorted `token0:token1`; prices are token1 per token0. The API re-orients to the URL's base/quote (inverting prices and swapping sides when needed). |
| Spot pools | `exchange_getPools`, `exchange_getPool` | Price, liquidity, ticks, positions, TWAP. |
| Swap quote | `exchange_quoteSwap` | The exact fill the next block gives if nothing trades first. |
| Spot trades / candles | trade API indexer over `/get_blocks` + `exchange_getTransactionReceipt` | `SWAP` receipts carry exact `amount_in`, `amount_out`, `price`. See §7 for the gap. |
| Perp markets, book, trades | `perp_getMarkets`, `perp_getOrderBook`, `perp_getTrades`, `perp_getEvents` | Oracle, mark, funding, OI come from the node. |
| Accounts | `perp_getAccount`, `exchange_getOpenOrders`, `exchange_getPositions`, `exchange_getTokenBalance` | |
| Index price (USD) | Coinbase Exchange → Kraken → CoinGecko | First healthy source wins; the response names it. Binance is not used: it returns HTTP 451 from US edge locations. |
| Reference candles | Coinbase `/products/{id}/candles` → Kraken `OHLC` | Used for the chart of verified assets until the market has its own history. The chart says which it is showing. |

The API caches node reads for 1–2 s and external reads for 10–60 s per isolate,
and collapses concurrent identical requests into one upstream call.

## 2. URLs and pair resolution

Trading is always in pairs:

| URL | Meaning |
|---|---|
| `/trade` | Markets list (spot and perps). |
| `/trade/{base}/{quote}` | Spot market, e.g. `/trade/qrdx/btc`, `/trade/eth/usdc`. |
| `/trade/{base}` | Redirects to the base's default pair: the first quote that has a live market, else `usdc`. |
| `/perps/{base}/{quote}` | Perpetual, e.g. `/perps/btc/usd` → node market `BTC-USD-PERP`. |
| `/swap` | Swap form (`?from=&to=` use the same segments). |
| `/pools`, `/pools/{poolId}` | Pools list, pool detail with add / remove liquidity. |
| `/pools/new` | Create a pool for any two tokens (`?token=0x…` preselects one). |
| `/launch` | Launch a community coin; feed of the newest ones (§10). |
| `/portfolio` | Balances, open orders, LP positions, perp account. |
| any page `?network=testnet` | Opens on testnet when no wallet decides otherwise (§9). |

A pair segment is either:

- **a verified asset slug** — lower-case ticker of a major asset from the verified
  registry (`qrdx`, `btc`, `eth`, `usdc`, …). Case-insensitive.
- **a token address** — `0x` + 40 hex, for any token that is not verified.
  `/trade/0x9f3c…41ab/usdc` is how an unverified token trades.

Resolution:

1. Slug in the registry → that asset.
2. Address → if it is the address of a verified asset on this network, the page
   **redirects (308) to the slug URL**; otherwise it resolves as an unverified
   token from `exchange_getToken`, and the page shows an "unverified token"
   banner with the address, creator and authorities.
3. Anything else (including the *symbol* of an unverified token) → 404 page that
   lists node tokens with that symbol, by address. Symbols are not unique and
   anyone can deploy a token called `USDC`, so a symbol never resolves to an
   unverified token.

### The verified registry

`lib/assets.ts` lists the major assets. Each entry has a slug, display symbol,
name, decimals, its external price identifiers (Coinbase product, Kraken pair,
CoinGecko id), and how to find its token on each network:

- a pinned address per network (`addresses.mainnet`), or
- a match rule: on-chain symbol (e.g. `qBTC`) **and** creator in the network's
  verified-issuer list (the bridge / foundation accounts, `QRDX_{MAIN,TEST}_VERIFIED_ISSUERS`).

QRC-20 addresses are derived at deploy time (`blake2b(sender:nonce:symbol)`), so
pinning is only possible once a network's tokens exist; the issuer rule covers
fresh testnets. A token matched neither way is unverified, whatever its symbol.

**Native QRDX on spot.** The spot ledger trades QRC-20 tokens only; native QRDX
is not a token address there. The registry maps `qrdx` to the network's wrapped
QRDX token (`wQRDX`, pinned or issuer-matched). Until one exists, `qrdx` pairs
show the index price and "no on-chain market yet" instead of a book. Perps use
`QRDX` natively as collateral when the node is configured that way.

## 3. Trading page layout

Modelled on Hyperliquid: one dense screen, no page scroll on desktop.

```
┌ nav: Trade · Perps · Swap · Pools · Portfolio ················ network · wallet ┐
├ market bar: [QRDX/BTC ▾]  last  24h Δ  24h vol  index  (perps: mark · oracle · funding · OI) ┤
├──────────────────────────────────────┬───────────────────┬────────────────────────┤
│ chart (lightweight-charts)           │ order book │ trades│ order form             │
│  candles: market history, or the     │ asks (red)          │  Buy | Sell           │
│  reference index when the market has │ spread · mid        │  Limit | Market       │
│  none (labelled)                     │ bids (green)        │  price, size, %       │
│                                      │ click a level →     │  (perps: leverage,    │
│                                      │ fills the price     │   reduce-only, TIF)   │
├──────────────────────────────────────┴───────────────────┤  fee · est. fill ·    │
│ Balances · Open orders · Positions · Trade history · Pending                     │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Mobile collapses to tabs: Chart · Book · Trades, with the order form in a sheet.

Behaviour that follows from the chain:

- **Blocks are ~180 s.** A submitted order is *pending* until a block includes
  it. The Pending tab tracks each transaction hash and polls
  `exchange_getTransactionReceipt`, then shows fills, the order id, or the
  error. The book does not change optimistically.
- **Market orders** are limit orders with `tif: "ioc"` (perps) or swaps (spot).
  Spot market buys/sells use `SWAP` with `venue: auto` and
  `min_amount_out = quote × (1 − slippage)`, so the node routes to the better of
  the book and the pools.
- **Fees.** Every executed exchange operation burns gas (≈0.00004–0.00015 QRDX),
  even when it fails. The form shows it. Spot book fees are 0.02 % maker /
  0.05 % taker; pool fees are the pool's tier.
- **Escrow.** A resting spot order escrows its funds (quote for buys, base for
  sells); the balance panel shows available vs. in orders.

Rules for what the site signs (`lib/orders.ts`, the order forms):

- **Inverted pairs.** On `/trade/eth/usdc` where ETH is the node's `token1`,
  "buy 0.5 ETH at 2,642.77" is placed as the node-side order "sell 1,321.385
  USDC at 1/2,642.77". The inverse price is rarely exact at 18 places, so it is
  rounded toward the user: up for a node-side sell (a minimum), down for a buy
  (a maximum). The order can then never fill worse than the price typed.
- **Swaps sign the typed amount.** A quote's `amountIn` is what the route
  consumes (AMM rounding leaves dust, e.g. `999.999999999999931…` of 1000), so
  `amount_in` is the user's amount and only `min_amount_out` comes from the
  quote. The form will not submit until the quote matches the current input.
- **Deadlines** are block time + 30 minutes, generous because blocks are
  minutes apart.

## 4. Wallet integration

The site talks to the **QRDX Wallet extension** through its injected provider
(`qrdx-wallet/docs/DAPP_INTEGRATION.md`). Discovery is EIP-6963
(`rdns: org.qrdx.wallet`), falling back to `window.qrdx`.

| Step | Call |
|---|---|
| Connect | `qrdx_requestAccounts` → `[{ address, pqAddress, pqAccountId, … }]`. Trading uses `pqAddress`: every exchange operation is signed by the account's ML-DSA-65 key. |
| Network | `qrdx_chainInfo`; `wallet_switchEthereumChain` if the wallet is on a different QRDX network from the site. |
| Place / cancel / swap / LP / perps | `qrdx_sendExchangeTransaction({ op, params })` → `{ txHash }` |
| Track | `exchange_getTransactionReceipt` (through the API, so it works for read-only visitors too). |
| Events | `accountsChanged`, `chainChanged`, `disconnect` re-scope the page. |

Operation parameters (from the node's `docs/PERPS_API.md`):

| UI action | op | params |
|---|---|---|
| Spot limit | `PLACE_ORDER` | `pair` (`base:quote` addresses), `side`, `order_type: "limit"`, `price`, `amount` (base) |
| Spot cancel | `CANCEL_ORDER` | `order_id`, `pair` |
| Spot market / swap | `SWAP` | `token_in`, `token_out`, `amount_in`, `min_amount_out`, `venue`, optional `deadline` |
| Add liquidity | `ADD_LIQUIDITY` | `pool_id`, `tick_lower`, `tick_upper`, `amount` (L, from `exchange_quoteLiquidity`) |
| Remove liquidity | `REMOVE_LIQUIDITY` | `pool_id`, `position_id`, optional `amount` |
| Perp deposit / withdraw | `PERP_DEPOSIT` / `PERP_WITHDRAW` | `amount` |
| Perp leverage | `PERP_SET_LEVERAGE` | `market_id`, `leverage`, `mode` |
| Perp order | `PERP_ORDER` | `market_id`, `side`, `size`, `price`, `reduce_only`, `tif` |
| Perp cancel | `PERP_CANCEL` | `market_id`, `order_id` |

### Wallet changes made for trading

1. **Pending exchange nonces.** `exchange_getNonce` returns the next nonce after
   *committed* state only. With 180 s blocks, a second order before the next
   block reused the same nonce and the node refused it (`nonce N already
   queued`). The wallet now tracks nonces it has submitted and not yet seen
   committed, signs with the first free nonce at or above the node's (the node
   includes a sender's operations only as a gap-free run), and on an "already
   queued" / "too low" refusal marks that nonce taken and re-signs the same
   approved operation with the next one.
2. **Readable approvals.** The approval window decodes each exchange operation
   ("Buy 0.01 qBTC at 84,058.6 qUSDC", "Swap 1,000 qUSDC for at least 0.0117
   qBTC", "Close-only sell 1 BTC-USD-PERP at up to 64,000") and resolves
   token addresses to symbols via `exchange_getToken`, flagging tokens it cannot
   resolve. The raw parameters remain visible below.
   Every order is also shown from the other token's side ("Same as: Buy 0.5
   qETH at 2,642.77 qUSDC"), because the wallet cannot know which orientation
   the site displayed, and node amounts lose their trailing zeros
   (`1000.000000000000000000` → `1,000`).
3. **`from` may be either credential.** `qrdx_sendExchangeTransaction` accepted
   only the classic `0x` address as `from`; it now also accepts the account's
   own `0xPQ` address. The site sends the classic one.
4. **More reads pass through**: `perp_getEvents`, `exchange_getStateRoot`.
5. **Launch approvals.** `TOKEN_DEPLOY` shows the name, ticker, supply and
   whether anyone can mint more or freeze balances; `CREATE_POOL` shows the
   pair, starting price, fee, and the QRDX it burns or stakes. A token deployed
   earlier in the same block is shown as "not created yet" rather than flagged
   as unknown.

### Phone wallet: QRDX Connect

Without the extension, the site connects to the QRDX Wallet on a phone (the
iPhone PWA) or in another browser by QR code: **QRDX Connect**
([CONNECT.md](CONNECT.md)). Connect → "QRDX Wallet on your phone" shows a code;
the wallet scans it (or opens its link) and runs the same `ProviderRouter` as
the extension, so the site sees the same EIP-1193 provider and the user sees
the same approvals, on the phone. Messages go through an end-to-end encrypted
relay (`relay/`, a Cloudflare Durable Object, WebSocket with HTTP long-poll
fallback) that also attests which site opened the session. The site shows when
the phone app is closed; requests wait for it.

## 5. Public API — `trade.qrdx.org/api/v1` (testnet: `/api/v1-test`)

Read-only, JSON, CORS-open, no key. Full reference: [API.md](API.md). Both
prefixes serve the same endpoints, each against its own network's node (§9).

```
GET /api/v1                                   endpoint index + network
GET /api/v1/assets                            verified registry + node tokens
GET /api/v1/assets/{asset}                    one asset (slug or address)
GET /api/v1/markets                           every spot pair and perp market, with tickers
GET /api/v1/markets/{base}/{quote}            spot market summary
GET /api/v1/markets/{base}/{quote}/orderbook  ?depth=
GET /api/v1/markets/{base}/{quote}/trades     ?limit=
GET /api/v1/markets/{base}/{quote}/candles    ?interval=&limit=
GET /api/v1/perps                             every perp market
GET /api/v1/perps/{base}/{quote}              perp market (+ /orderbook, /trades, /candles)
GET /api/v1/pools                             ?base=&quote=
GET /api/v1/pools/{poolId}                    ticks, positions, ?twap=
GET /api/v1/quote                             ?from=&to=&amount=&sender=&venue=
GET /api/v1/quote/liquidity                   ?pool=&tickLower=&tickUpper=&amount0=&amount1=
GET /api/v1/accounts/{address}                balances, spot orders, LP positions, perp account
GET /api/v1/receipts/{txHash}                 exchange receipt
GET /api/v1/prices                            ?assets=btc,eth  index prices
GET /api/v1/markets/{base}                    default pair for /trade/{base}
GET /api/v1/launches                          newest community tokens and their markets
```

Errors are `{ "error": { "code", "message" } }` with HTTP 400 / 404 / 502
(`bad_request`, `not_found`, `ambiguous_symbol`, `node_unavailable`). An
external price source that fails yields `null` prices, not an error. Successful
responses carry
`source` and `asOf`.

The API deliberately has no write endpoints. Writes are signed by the wallet and
go to the node; proxying them would add a party that could reorder or drop them.

## 6. Code map

```
app/
  page.tsx                              → /trade
  (trading)/layout.tsx                  compact nav (AppNav) for the trading app
  (trading)/trade/page.tsx              markets list + index prices
  (trading)/trade/[base]/page.tsx       → /trade/{base}/{default quote}
  (trading)/trade/[base]/[quote]/       spot trading (SpotTradeView)
  (trading)/perps/…                     /perps → first market; perps trading (PerpTradeView)
  (trading)/swap/  pools/  pools/[poolId]/  pools/new/  launch/  portfolio/
  api/[version]/**/route.ts             public API; [version] is v1 (mainnet) or v1-test (testnet)
  analytics/ partner/ stake/ wallets/   older pages, still sample data (banner says so)
components/
  AppNav.tsx                            nav, network badge, wrong-network banner
  trade/                                MarketSelector, OrderBookPanel, TradesPanel, PriceChart,
                                        SpotOrderForm, PerpOrderForm, PerpTables, AccountPanel,
                                        SpotTradeView, PerpTradeView, MarketsTable, TokenBadge
  swap/SwapCard.tsx  pools/PoolsList.tsx  pools/PoolDetail.tsx  pools/CreatePool.tsx
  launch/LaunchForm.tsx  launch/LaunchFeed.tsx  portfolio/Portfolio.tsx
  routing/NetworkRedirect.tsx           redirects that depend on the network shown
  wallet/ConnectButton.tsx
lib/
  config.ts                             networks, the main/test slots, per-slot node and verification config
  launch.ts                             token address derivation, launch curve placement, pool costs
  assets.ts                             verified registry (shared client/server)
  decimal.ts                            exact 18-place decimal arithmetic on strings
  pairs.ts                              canonical pair ↔ URL orientation, book inversion
  orders.ts                             order parameters in node terms
  format.ts  types.ts
  hooks/useApi.ts                       polling reads of /api/v1
  wallet/provider.ts                    EIP-6963 discovery, EIP-1193 types
  wallet/WalletContext.tsx              connection (extension or phone), account, the network shown (useNet), sendExchange
  wallet/remote.ts                      QRDX Connect: the phone wallet as an EIP-1193 provider
  connect/                              QRDX Connect protocol: encryption, pairing links, relay client
  wallet/pending.ts                     submitted transactions → receipts
  server/net.ts                         per-network context (config, node client, cache namespace)
  server/node.ts                        typed exchange_* / perp_* / REST client, one per network
  server/launches.ts                    the launch feed
  server/resolve.ts                     segment → asset / token, redirects
  server/markets.ts                     spot + perp market assembly, stats, candles
  server/accounts.ts                    accounts, pools, quotes
  server/reference.ts                   index prices + reference candles
  server/indexer.ts                     spot trades from blocks
  server/cache.ts  server/http.ts
relay/                                  QRDX Connect relay: Worker + Durable Object (CONNECT.md)
scripts/local-node/                     local exchange node for development (§11)
tests/unit/                             vitest: decimals, orientation, orders, indexing, stats
tests/e2e/trade-wallet.mjs              wallet extension + site + local node, end to end
tests/e2e/trade-phone.mjs               phone wallet (web app) + relay + site + local node, end to end
```

`lib/assets.ts`, `lib/decimal.ts`, `lib/pairs.ts`, `lib/orders.ts` and `lib/launch.ts` are pure
and shared by the API and the UI. Everything under `lib/server` is fetch-only so
it runs on the Cloudflare edge runtime.

## 7. Node gaps (reference only; not changed here)

The trade site works within what `qrdx-node` exposes today. These are the
limits, and what the node would need to lift them:

| Gap | Effect here | Node change that fixes it |
|---|---|---|
| Spot order-book fills are not journaled (`journal.py` records `fill` events only for `PERP_ORDER`); a `PLACE_ORDER` receipt has `filled` but no fill prices. | Spot trade history and candles include `SWAP` executions only. Limit-order fills show in the user's own order status, not in the public tape. | Record spot fills in the journal and serve `exchange_getTrades(pair, limit)`. |
| No wrapped native QRDX token. | `qrdx/*` spot pairs have no on-chain market until a `wQRDX` token is deployed. | Deploy a wQRDX token with a wrap/unwrap op, or let spot settle `QRDX` natively as perps collateral does. |
| `exchange_getNonce` ignores the mempool. | Handled in the wallet (§4). | A `pending` flag on `exchange_getNonce`. |
| Streams (`/ws`) are opt-in per node (`QRDX_ENABLE_STREAMING`). | The site polls (book 2 s, account 5 s). | Enable streaming on public nodes; the client already has the channel names. |
| Spot books exist only for pairs that have a pool (`CREATE_POOL` creates both). | A pair with no pool has no book. | — (by design) |
| No spot trade history endpoint at all. | The indexer keeps trades in isolate memory, re-reads the last ~600 blocks on a cold start, and resets when the chain gets shorter than what it read; it does not detect a same-height reorg. | Same as the first row; until then, phase 4 below. |

## 8. Phases

1. **Foundation** — done: this document, the API reference, config, verified
   registry, node client, reference prices, `/api/v1`, pair routing.
2. **Trading** — done: wallet connection, spot trading page, pending tracker,
   wallet nonce fix and readable approvals.
3. **Perps, swap, pools** — done: perps page (leverage, reduce-only, IOC market
   orders, collateral, positions), swap, pools with add / remove liquidity,
   portfolio.
4. **Indexer and streams** — next: durable spot trade storage (Cloudflare D1
   or a Durable Object) with block-hash reorg detection; WebSocket streams
   where nodes enable them, replacing polling.
5. **Phone wallet** — done: QRDX Connect, so the web wallet and iPhone PWA
   can trade by QR code (CONNECT.md).
6. **The older pages** (analytics, stake, partner, wallets) still show sample
   data and the old navigation; rebuild them on the API or remove them.

## 9. Networks: mainnet and testnet

One deployment serves both. Each network is a **slot** with its own API prefix,
node, and asset verification:

| Slot | API | Network (default) | Node |
|---|---|---|---|
| main | `/api/v1` | QRDX Mainnet, chain 1337 | `rpc.qrdx.org`, `node.qrdx.org` |
| test | `/api/v1-test` | QRDX Testnet, chain 31337 | `test.qrdx.org/rpc`, `test.qrdx.org` |

The pages decide which network to show:

1. **A connected wallet on mainnet or testnet wins.** Switch the wallet to QRDX
   Testnet and the site shows testnet markets, balances and transactions; switch
   back and it shows mainnet. Nothing is mixed: pending transactions, launch
   progress and caches are kept per network.
2. **Otherwise the visitor's choice**: the Mainnet / Testnet selector in the
   nav (remembered), or `?network=testnet` in a link.
3. **Choosing in the nav with a wallet connected asks the wallet to switch**
   (`wallet_switchEthereumChain`), so the wallet and the site never disagree
   about where an order goes. A wallet on any other chain gets a banner.

A testnet strip under the nav names the network and the API prefix.

Server side, every `lib/server` function takes a `Net` (`lib/server/net.ts`):
the slot's config, a node client bound to its endpoints, and a cache namespace.
The indexer keeps separate state per network. Configuration per slot:

```
NEXT_PUBLIC_QRDX_MAIN_NETWORK   mainnet          which network the main slot serves
NEXT_PUBLIC_QRDX_TEST_NETWORK   testnet          …and the test slot (local for development)
QRDX_MAIN_RPC_URL / QRDX_TEST_RPC_URL            node JSON-RPC overrides
QRDX_MAIN_NODE_URL / QRDX_TEST_NODE_URL          node REST overrides
QRDX_MAIN_VERIFIED_ISSUERS / QRDX_TEST_…          creators whose tokens can be the verified assets
QRDX_MAIN_ASSET_ADDRESSES / QRDX_TEST_…           pinned verified-asset addresses (JSON)
```

## 10. Launchpad: community coins

`/launch` creates a coin with a market in two blocks, pump.fun style, for coins
that are **not** major assets: they are unverified, trade by address, and carry
the unverified banner everywhere.

**What a launch is.** Three exchange operations, all from the creator's PQ key:

1. `TOKEN_DEPLOY` — name, ticker, 18 decimals, the whole supply to the creator,
   **no mint authority and no freeze authority**: the supply is fixed forever
   and no one can lock a holder's coins.
2. `CREATE_POOL` — the coin against a verified asset (QRDX first, like SOL on
   pump.fun), 1 % fee by default, opening just outside the launch curve.
3. `ADD_LIQUIDITY` — the **launch curve**: the coin alone, deposited in a price
   range from the starting price up to 10×, 100× or 1000× it.

Steps 1 and 2 go into the same block. TOKEN_DEPLOY's address is
`blake2b-160("sender:nonce:symbol")` (node `derive_token_address`); the wallet
returns the nonce it signed with, so the site computes the address and signs
the pool right away. The node includes a sender's operations in nonce order, so
the pool sees the token. Step 3 needs the pool's id, which comes from a global
counter, so it waits for that block. The progress panel tracks receipts,
checks the token landed at the computed address, and survives a reload.

**Why a curve on an ordinary pool.** A concentrated-liquidity position that
holds only the coin, above the current price, is a bonding curve: each buy
swaps the quote asset in and moves the price up the range, and selling moves it
back down. Because it is a normal pool, the coin is immediately on the order
book, routable by swaps, and open to anyone else's liquidity. The pool opens
half a tick outside the range so the deposit needs none of the quote asset
(token0 coins sit above the price, token1 coins below; `lib/launch.ts`).

**Costs and trust.** The node charges for pools (`amm.py`
`POOL_STAKE_REQUIREMENTS`): burn 5,000 QRDX for a permanent community pool
(the default), or stake 10,000 QRDX, refundable only after every position in
the pool is withdrawn. The form reads the creator's QRDX balance from the
wallet and refuses to start without enough. The curve is the creator's own
liquidity position, and they can withdraw it; the launch page says so.
Creators may keep up to half the supply; the feed shows each coin's supply
flags, creator, age, price, market cap (in USD when the quote has an index
price) and 24 h change and volume.

**Gaps.** No images or descriptions: the node's token registry has name and
symbol only, and the site has no store of its own yet. No "graduation": the
curve simply runs out at its top price, after which the coin trades on
whatever liquidity others added.

**Token only, market later.** The form's "Token only" mode sends just the
`TOKEN_DEPLOY` (gas only, no QRDX for a pool). Once the token exists, "Start its
market" opens `/launch?token=0x…`, which runs the market half for an existing
token: `CREATE_POOL`, then the curve from a share of the holder's balance. Any
holder can do this for any token, and coins in the feed without a market link
to it. On a network with no verified asset to pair against, token-only is the
only mode offered.

**Pairing with QRDX.** Spot trades QRC-20 tokens only, so "QRDX" in a pair is
**wrapped QRDX (wQRDX)**, the verified `qrdx` asset. Where a network has one,
it is the default quote. The node has no wrap / unwrap operation yet (§7), so a
wQRDX token today is only as good as whoever mints it; a 1:1 native-backed
wQRDX needs a node change: a `WRAP` op moving native QRDX to a protocol holder
and minting the token, and an `UNWRAP` op reversing it (the same pattern as
perps collateral, `PERP_DEPOSIT` / `PERP_WITHDRAW`).

`/pools/new` creates a pool for any two tokens, for anyone who wants a market
without the launch curve.

## 11. Developing and testing

`scripts/local-node/node_harness.py` serves the subset of the node's JSON-RPC
and REST surface this site and the wallet use, backed by **qrdx-node's real
exchange engine** (imported read-only). It seeds wQRDX, qBTC, qUSDC, qETH and an
unverified PEPE with pools, resting orders, a day of swaps and a BTC perp,
produces a block every `BLOCK_SECONDS`, and has a faucet (`POST /faucet`). In
place of liboqs it uses dilithium-py (pure-Python FIPS 204 ML-DSA-65), so the
node's own verification checks the wallet's real signatures.

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/local-node/requirements.txt
BLOCK_SECONDS=8 PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/local-node/node_harness.py
NEXT_PUBLIC_QRDX_TEST_NETWORK=local pnpm dev   # the local node serves as testnet
```

- `pnpm test` — unit tests (decimal arithmetic, book inversion, order
  conversion and rounding, swap indexing, 24 h stats, candles).
- `node tests/e2e/trade-wallet.mjs` — loads the built wallet extension in
  Chromium, imports a wallet, connects to the site, switches network, places
  two orders in one block window, an inverted-pair order, cancels, swaps,
  opens a perp position, and launches a coin and buys on its curve, checking
  each against the node.

The harness differs from a node in what it leaves out: no consensus, balances in
memory, oracle prices set by the harness. Run against a real testnet node
before trusting anything about those.
