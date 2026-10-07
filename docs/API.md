# QRDX Trade API

A read-only market data API over the QRDX chain's native exchange. It serves the
trade site and anyone else; there is no key and CORS is open.

| Network | Base URL | Node |
|---|---|---|
| Mainnet | `https://trade.qrdx.org/api/v1` | `node.qrdx.org` |
| Testnet | `https://trade.qrdx.org/api/v1-test` | `test.qrdx.org` |

Both prefixes serve the same endpoints with the same shapes; everything below is
written against `/api/v1`. Testnet tokens have no value, and testnet asset
verification is configured separately, so the same slug can resolve to a
different token address on each network. Any other version is `404`.

Placing orders is **not** done here. Orders are exchange transactions signed by
the trader's post-quantum key and submitted to a QRDX node
(`exchange_sendTransaction`), normally through the QRDX Wallet
(`qrdx_sendExchangeTransaction`). See [ARCHITECTURE.md](ARCHITECTURE.md) §4.

## Conventions

- **Amounts and prices are decimal strings**, as the node reports them (up to 18
  decimal places; some quote fields carry more). Do not parse them to floats for
  anything you sign.
- **Times** are Unix seconds.
- **Assets in paths** are a verified slug (`btc`, `eth`, `usdc`, `qrdx`, …) or a
  token address (`0x` + 40 hex) for unverified tokens. Using the address of a
  verified token returns `308` to the same path with the slug.
- **Pair orientation** follows the path: in `/markets/eth/usdc` prices are USDC
  per ETH and sizes are in ETH, whatever the node's canonical (address-sorted)
  order is.
- Success bodies carry `source` (`node`, `indexer`, `coinbase`, `kraken`,
  `coingecko`) and `asOf`.
- Node-derived objects that are passed through unchanged (pool detail, LP
  positions, the perps account, receipts, liquidity quotes) keep the node's
  `snake_case` field names; everything assembled here is `camelCase`.
- Errors: `{ "error": { "code": "…", "message": "…" } }`.

| HTTP | code | when |
|---|---|---|
| 400 | `bad_request` | invalid parameter |
| 404 | `not_found` | unknown asset, market, pool or receipt |
| 404 | `ambiguous_symbol` | a symbol that is not a verified slug; `candidates` lists node tokens with that symbol, by address |
| 502 | `node_unavailable` | the QRDX node did not answer |

Responses are cached for 1–2 s (node data) or 10–60 s (external prices).

### The asset object

Used wherever an asset appears (`base`, `quote`, `from`, `to`, `asset`):

```json
{ "segment": "btc", "slug": "btc", "symbol": "BTC", "name": "Bitcoin",
  "verified": true, "address": "0x0e35…5658", "onChainSymbol": "qBTC",
  "decimals": 8, "color": "#f7931a", "listed": true }
```

`segment` is what goes in a URL. An unverified token has `slug: null`,
`segment` equal to its address, and the node's symbol and name. `listed: false`
means a verified asset with no token on this network yet (`address: null`).

---

## Index

### `GET /api/v1`

```json
{ "name": "QRDX Trade API", "version": "v1", "network": "mainnet", "networkName": "QRDX Mainnet",
  "chainId": 1337, "node": "https://node.qrdx.org", "docs": "…",
  "networks": { "mainnet": "/api/v1", "testnet": "/api/v1-test" },
  "endpoints": ["/api/v1/assets", "…"] }
```

---

## Assets

### `GET /api/v1/assets[?all=1]`

```json
{ "assets": [ <asset>, … ],
  "tokens": [ { …<asset>, "totalSupply": "1000000000", "maxSupply": null,
                "creator": "0xPQ…", "mintAuthority": null, "freezeAuthority": null,
                "createdHeight": 7 } ],
  "nodeOk": true, "source": "node", "asOf": 1790898900 }
```

`assets` is the verified registry resolved against the node. `tokens` (only with
`?all=1`) is every other native token on the node.

### `GET /api/v1/assets/{asset}`

The asset object plus `token` (supply and authorities, or `null`) and `index`
(its USD index ticker, or `null`).

---

## Spot markets

A spot market exists for a pair when the node has a pool for it (creating a pool
also creates the pair's order book).

### `GET /api/v1/markets`

```json
{ "spot": [ <spot market>, … ], "perps": [ <perp market>, … ],
  "nodeOk": true, "source": "node", "asOf": 1790898900 }
```

Every pair with a pool, oriented by quote preference (USDC, USDT, BTC, ETH,
QRDX, then verified over unverified).

### `GET /api/v1/markets/{base}`

The pair a bare `/trade/{base}` opens: `{ "base": "qrdx", "quote": "usdc",
"path": "/trade/qrdx/usdc" }`. The quote is that of the base's most active live
market, else USDC. Resolves `base` like any pair segment (308 for a verified
token's address, `ambiguous_symbol` for an unverified symbol).

### `GET /api/v1/markets/{base}/{quote}`

A spot market:

```json
{ "type": "spot", "id": "btc/usdc", "path": "/trade/btc/usdc", "status": "live",
  "base": <asset>, "quote": <asset>,
  "pair": "0x0e35…:0x2a8f…", "inverted": false,
  "last": "84732.49", "lastSource": "trade",
  "bestBid": "84907.71", "bestAsk": "85043.67", "mid": "84975.69", "spread": "135.96",
  "change24h": "-0.02", "volume24h": "111123.56",
  "pools": [ { "poolId": "d3ad94d15acad6e4", "feeTier": 3000, "feeRate": "0.003",
               "tickSpacing": 60, "price": "84975.7", "liquidity": "377626.07",
               "positions": 1, "paused": false, "token0": "0x0e35…", "token1": "0x2a8f…",
               "holderAddress": "0xPOOL…" } ],
  "indexPrice": "85448.79", "baseIndex": <index ticker>, "quoteIndex": <index ticker>,
  "source": "node", "asOf": 1790898900 }
```

| field | meaning |
|---|---|
| `status` | `live` (has a pool), `no_market` (both tokens exist, no pool), `unlisted` (a verified asset has no token on this network), `node_unavailable` |
| `pair` | the node's canonical `token0:token1` |
| `inverted` | the path's base is the node's `token1`, so the API inverts the node's prices |
| `change24h`, `volume24h` | from the trade tape, else from the reference pool's recorded history (ARCHITECTURE.md §12); `volume24h` is in the quote |
| `baseUsd` | the base's USD price (see Prices: an index price, or a route through pools), or `null` |
| `last` / `lastSource` | the most recent indexed trade (`trade`), else the deepest pool's price (`pool`) |
| `change24h` | percent, against the last trade at or before 24 h ago; `null` without history |
| `volume24h` | quote units over the last 24 h of indexed trades |
| `pools[].price` | oriented to the path (quote per base) |
| `indexPrice` | base/quote implied by USD index prices; `null` unless both have one |

### `GET /api/v1/markets/{base}/{quote}/orderbook?depth=20`

`depth` 1–500. Levels are `[price, size, cumulativeSize]`, best first, price in
quote per base and size in base.

```json
{ "market": "btc/usdc",
  "bids": [["84907.71", "0.0235", "0.0235"], ["84890.72", "0.0235", "0.047"]],
  "asks": [["85043.67", "0.0235", "0.0235"]],
  "bestBid": "84907.71", "bestAsk": "85043.67", "mid": "84975.69",
  "spread": "135.96", "spreadBps": "16.00", "escrowAddress": "0xBOOK…",
  "source": "node", "asOf": 1790898900 }
```

### `GET /api/v1/markets/{base}/{quote}/trades?limit=50`

Executed trades, newest first. `side` is the taker's side in the path's
orientation.

```json
{ "market": "btc/usdc",
  "trades": [ { "id": "ca12…:0", "time": 1790898720, "price": "84732.49",
                "size": "0.1798", "side": "sell", "venue": "amm",
                "txHash": "ca12…", "blockHeight": 116 } ],
  "source": "indexer", "coverage": { "fromBlock": 0, "toBlock": 309 }, "asOf": … }
```

Trades come from the node's market data (`source: "node"`): book fills and
pool swaps alike, `venue` `clob` or `amm`. On a node without it, the indexer
serves swaps only (`source: "indexer"`). `coverage` is the block
range the indexer has read. `available: false` means this deployment does not
index blocks for this network (the public nodes cost-limit block reads), so
there is no tape; charts and 24 h stats then come from pool history.

### `GET /api/v1/markets/{base}/{quote}/candles?interval=1h&limit=300`

`interval`: `1m 5m 15m 1h 4h 1d`; `limit` up to 500.

```json
{ "market": "btc/usdc", "interval": "1h", "kind": "market", "exact": true,
  "label": "BTC/USDC · QRDX swaps",
  "candles": [ { "t": 1790895600, "o": "84900", "h": "85020", "l": "84870", "c": "84990", "v": "12.4" } ],
  "source": "indexer", "asOf": … }
```

| `kind` | candles from |
|---|---|
| `market` | this market's indexed trades (`source: "indexer"`, `v` in base units), or, with no trade tape, its reference pool's recorded price (`source: "history"`, `label` ends "· pool price"; one point per block, `v` in base units, both directions) |
| `index` | public exchanges, when the market has no trades and both assets have USD prices. `label` names the series and provider. With a USD-stable quote the series is the base's USD candles; otherwise it is a base/quote ratio whose `h`/`l` are bounds (`exact: false`) |
| `none` | nothing available |

---

## Perpetuals

### `GET /api/v1/perps`

`{ "perps": [ <perp market>, … ], "nodeOk": true, … }`

Perp markets include `collateralToken`: what perps settle in on this network
(a token address, `"QRDX"` for native QRDX, `""` when the nodes configure none
and refuse deposits, or `null` if unknown). `markPrice` / `oraclePrice` are
`null` until validators have priced the market.

### `GET /api/v1/perps/check?base=SOL`

Before creating a market (ARCHITECTURE.md §13): whether it exists, and whether
validators can price its base from public USD spot prices.

```json
{ "base": "SOL", "quote": "USD", "marketId": "SOL-USD-PERP", "exists": false,
  "path": "/perps/sol/usd", "nodeOk": true,
  "oracle": { "underlying": "SOL", "price": "120.0425",
              "sources": [ { "source": "coinbase", "price": "120.045" },
                           { "source": "kraken", "price": "120.04" } ] } }
```

`oracle.price` is null when no public exchange lists the base against USD.

### `GET /api/v1/perps/{base}/{quote}`

`/perps/btc/usd` is the node market whose base is `BTC` and quote `USD`
(`BTC-USD-PERP`).

```json
{ "type": "perp", "id": "BTC-USD-PERP", "path": "/perps/btc/usd",
  "base": "BTC", "quote": "USD", "baseAsset": <asset>,
  "markPrice": "84876.58", "oraclePrice": "85041.99", "oracleTime": 1790898895,
  "lastTradePrice": "85085.0", "openInterest": "0.2",
  "bestBid": "84957.5", "bestAsk": "85085.0",
  "fundingRate": "0.0000125", "fundingTime": 1790895300, "nextFundingTime": 1790898900,
  "maxLeverage": "20", "maintenanceRate": "0.025",
  "change24h": "0.05", "volume24h": "17012.4",
  "indexPrice": "85440.25", "indexSource": "coinbase", "source": "node", "asOf": … }
```

`indexPrice` is the external reference for comparison; the node's own oracle is
`oraclePrice` (the validators' stake-weighted median).

### `GET /api/v1/perps/{base}/{quote}/orderbook?depth=20`

As the spot book, plus `markPrice` and `oraclePrice`.

### `GET /api/v1/perps/{base}/{quote}/trades?limit=50`

From the node's fill events. Liquidation fills have `"liquidation": true`.

### `GET /api/v1/perps/{base}/{quote}/candles?interval=1h`

Built from fills; falls back to the reference index series like spot.

---

## Pools

### `GET /api/v1/pools[?base=&quote=]`

Every pool, or one pair's.

```json
{ "pools": [ {
    "poolId": "d3ad94d15acad6e4", "token0": <asset>, "token1": <asset>,
    "market": { "base": <asset>, "quote": <asset>, "path": "/trade/btc/usdc" },
    "feeTier": 3000, "feeRate": "0.003", "tickSpacing": 60, "poolType": "STANDARD",
    "price": "84975.7", "marketPrice": "84975.7", "tick": 113509,
    "liquidity": "377626.07", "positions": 1, "volume": ["0.8664", "73611.2"],
    "protocolFees": ["0.0001", "6.6"], "paused": false,
    "holderAddress": "0xPOOL…", "creator": "0xPQ…" } ],
  "source": "node", "asOf": … }
```

`price` is token1 per token0 as the node reports it; `marketPrice` is quote per
base of `market`. `volume` is cumulative, per token.

### `GET /api/v1/pools/{poolId}?twap=3600`

The node's pool detail (`snake_case`, including `ticks` and `position_list`)
plus `token0Asset` / `token1Asset`. `twap` (seconds) adds the time-weighted
price.

---

## Quotes

### `GET /api/v1/quote?from=&to=&amount=&sender=&venue=auto&pool=`

The exact fill a `SWAP` of `amount` gets against the current state, from the
node's router. `from` / `to` are asset segments, `amount` is in `from` units,
`venue` is `auto`, `amm` or `clob`.

```json
{ "from": <asset>, "to": <asset>,
  "amountIn": "999.999999999999931552495424051", "amountOut": "0.011758664",
  "unfilledIn": "0.000000000000000068447504575949", "fee": "3",
  "executionPrice": "85043.9", "venue": "amm", "poolId": "d3ad94d15acad6e4",
  "priceImpact": "0.0002", "priceBefore": "84975.7", "priceAfter": "84992.6",
  "source": "node", "asOf": … }
```

- `executionPrice` is `from` paid per `to` received.
- `amountIn` is what the route consumes, which can differ from `amount` by
  rounding dust (or by a lot when liquidity runs out: see `unfilledIn`). Sign
  the **amount you asked for** as `amount_in`, and set `min_amount_out` from
  `amountOut` less your slippage tolerance.
- `404 not_found` when nothing can fill it.

### `GET /api/v1/quote/liquidity?pool=&tickLower=&tickUpper=&amount0=&amount1=` (or `&liquidity=`)

The node's liquidity quote: the liquidity `L` the amounts buy and the exact
deposit (`amount0`, `amount1`). A missing amount is unlimited. Send `liquidity`
as `ADD_LIQUIDITY`'s `amount`. Ticks must be multiples of the pool's spacing.

---

## Accounts

### `GET /api/v1/accounts/{address}[?tokens=0x…,0x…]`

`address` is the trader's `0xPQ…` address (the one that signs exchange
transactions).

```json
{ "address": "0xPQ…",
  "balances": [ { "asset": <asset>, "balance": "0.51", "inOrders": "0.02" } ],
  "spotOrders": [ { "market": "btc/usdc", "path": "/trade/btc/usdc",
                    "pair": "0x0e35…:0x2a8f…", "orderId": "3f9a…",
                    "side": "buy", "price": "84058.6", "amount": "0.01",
                    "filled": "0", "remaining": "0.01",
                    "base": <asset>, "quote": <asset> } ],
  "lpPositions": [ <node position> ],
  "perp": <node perps account>,
  "exchangeNonce": 7, "source": "node", "asOf": … }
```

- `balances` covers verified assets, tokens of the account's open orders, and
  any `?tokens=`. `balance` is spendable; `inOrders` is escrowed by resting
  orders.
- `spotOrders` are oriented to each pair's market (`market`, `side`, `price`,
  `amount`); `pair` and `orderId` are what `CANCEL_ORDER` takes.
- `exchangeNonce` counts committed operations only.

### `GET /api/v1/receipts/{txHash}`

The node's exchange receipt (`success`, `error`, `block_height`, `data` with
fills / order id / amounts, `fee`), or `404` while the transaction is pending
or unknown to this node. Poll after submitting; blocks are about 180 s apart.

---

## Launches

### `GET /api/v1/launches?limit=50`

The newest community tokens (anything that is not a verified asset), newest
first, with the market each trades on.

```json
{ "launches": [ {
    "token": <asset>, "creator": "0xPQ…", "createdHeight": 812,
    "totalSupply": "1000000000",
    "fixedSupply": true, "freezable": false,
    "market": { "quote": <asset>, "path": "/trade/0x7c1e…/qrdx", "poolId": "…",
                "feeRate": "0.01", "price": "0.00000598", "marketCap": "5983.09",
                "priceUsd": "0.00000508", "marketCapUsd": "5085.63", "liquidity": "1843.2",
                "change24h": "19.66", "volume24h": "1000" } } ],
  "height": 830, "source": "node", "asOf": … }
```

- `fixedSupply`: the token has no mint authority, so its supply can never grow.
  `freezable`: it has a freeze authority that can lock a holder's balance.
- `market` is the token's deepest unpaused pool against a verified asset, or
  `null`. `price` is quote per token (the last indexed trade, else the pool
  price); `marketCap` is `price × totalSupply` in the quote. `priceUsd` is the
  token's USD price (see Prices; usually a route through its pool), and
  `marketCapUsd` is `priceUsd × totalSupply`; both `null` with no route.
  `change24h` and `volume24h` come from the pool's recorded history.

---

## Status

### `GET /api/v1/status`

Node health, for the site's status bar: `{ network, networkName, chainId,
blockTimeSec, nodeOk, height, lastBlockHash, latencyMs, asOf }`. Read from the
node's `/get_status` at most every 3 s; `nodeOk: false` with null fields when
the node does not answer.

---

## Prices

### `GET /api/v1/prices[?assets=btc,qrdx,0x7c1e…]`

USD prices for any assets: verified slugs or token addresses, up to 100 (all
verified assets by default).

```json
{ "prices": {
    "btc": { "price": "85382.3", "change24h": "0.76", "high24h": "85568.99",
             "low24h": "84537.72", "volume24h": "1675.17",
             "source": "coinbase", "asOf": 1790898905, "route": [], "pools": [] },
    "0x7c1e…": { "price": "0.00000508", "change24h": "12.5", "high24h": null,
                 "low24h": null, "volume24h": null, "source": "route",
                 "asOf": 1790898905, "route": ["0x7c1e…", "qrdx", "btc"],
                 "pools": ["a1…", "b2…"] },
    "sol": null },
  "asOf": 1790898905 }
```

- Verified assets with an outside market use their index ticker. Sources are
  tried in order: Coinbase Exchange, Kraken, CoinGecko. `change24h` is a
  rolling 24 h change (`null` from Kraken, whose open is the UTC day's).
- Everything else, including launched coins and QRDX itself, is priced through
  the network's pools (`source: "route"`): `route` lists the assets from this
  one to the anchor whose index price was used, and `pools` the pools along the
  way. `change24h` is the change of the routed price from pool history, `null`
  until every hop has history.
- An asset with neither is `null`: no public price and no pool path to one.

### `GET /api/v1/prices/{asset}`

One asset's USD price, the same object plus `asset`:

```json
{ "asset": <asset>, "price": "0.00000508", "change24h": "12.5", "source": "route",
  "route": ["0x7c1e…", "qrdx", "btc"], "pools": ["a1…", "b2…"], … }
```

404 when the asset is unknown on this network, or has no USD price.
