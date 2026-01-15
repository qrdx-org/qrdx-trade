# Mock API Documentation

This document describes the mock API endpoints created for the QRDX Trade platform. These endpoints provide realistic, randomly generated data for development and testing purposes.

## Overview

All API endpoints are implemented as Next.js Edge API routes and return JSON responses. Data is generated with some consistency (cached for short periods) to simulate realistic market behavior.

## Endpoints

### 1. Price Data
**GET** `/api/price/[address]`

Returns current price and 24h statistics for a token.

**Parameters:**
- `address` (path): Contract address or 'native' for native tokens

**Response:**
```json
{
  "address": "0x123...",
  "price": 2845.32,
  "priceChange24h": 4.32,
  "volume24h": 8470000,
  "marketCap": 284532000000,
  "high24h": 2987.58,
  "low24h": 2702.05,
  "lastUpdate": 1705334400000
}
```

**Caching:** Prices are cached for 5 seconds with small variations to simulate live updates.

---

### 2. Chart Data
**GET** `/api/chart/[address]`

Returns OHLCV (Open, High, Low, Close, Volume) candlestick data for charting.

**Parameters:**
- `address` (path): Contract address
- `timeframe` (query): Chart interval - `1`, `5`, `15`, `60`, `240`, `D`, `W`
- `from` (query, optional): Start timestamp in milliseconds
- `to` (query, optional): End timestamp in milliseconds

**Response:**
```json
{
  "address": "0x123...",
  "timeframe": "60",
  "data": [
    {
      "time": 1705334400,
      "open": 2845.32,
      "high": 2867.45,
      "low": 2832.10,
      "close": 2850.23,
      "volume": 1250000
    }
  ]
}
```

**Timeframe Intervals:**
- `1` = 1 minute (1440 points = 1 day)
- `5` = 5 minutes (288 points = 1 day)
- `15` = 15 minutes (672 points = 7 days)
- `60` = 1 hour (720 points = 30 days)
- `240` = 4 hours (720 points = 120 days)
- `D` = 1 day (365 points = 1 year)
- `W` = 1 week (260 points = 5 years)

**Caching:** Chart data is cached for 10 seconds per address/timeframe combination.

---

### 3. Order Book
**GET** `/api/orderbook/[address]`

Returns current order book with bids and asks.

**Parameters:**
- `address` (path): Contract address
- `price` (query, optional): Base price for order generation

**Response:**
```json
{
  "address": "0x123...",
  "bids": [
    { "price": 2845.00, "amount": 2.3456, "total": 2.3456 },
    { "price": 2843.50, "amount": 1.7823, "total": 4.1279 }
  ],
  "asks": [
    { "price": 2847.00, "amount": 1.8934, "total": 1.8934 },
    { "price": 2848.50, "amount": 2.1567, "total": 4.0501 }
  ],
  "spread": 0.07,
  "lastUpdate": 1705334400000
}
```

**Caching:** Order book data is cached for 2 seconds to simulate rapid updates.

---

### 4. Recent Trades
**GET** `/api/trades/[address]`

Returns recent trade history.

**Parameters:**
- `address` (path): Contract address
- `limit` (query, optional): Number of trades to return (default: 50, max: 100)
- `price` (query, optional): Base price for trade generation

**Response:**
```json
{
  "address": "0x123...",
  "trades": [
    {
      "id": "0x123-456",
      "price": 2845.32,
      "amount": 1.2345,
      "timestamp": 1705334400000,
      "type": "buy"
    }
  ]
}
```

**Behavior:** New trades are added every ~3 seconds. Cache maintains last 100 trades.

---

### 5. Market Statistics
**GET** `/api/stats`

Returns global platform statistics.

**Parameters:** None

**Response:**
```json
{
  "tvl": 2400000000,
  "volume24h": 847000000,
  "activeUsers": 156000,
  "liquidityPools": 2847,
  "totalTrades": 1200000,
  "avgAPY": 24.5,
  "tvlChange24h": 12.3,
  "volumeChange24h": 8.7,
  "usersChange24h": 15.2,
  "lastUpdate": 1705334400000
}
```

**Caching:** Statistics are cached for 5 seconds with small variations.

---

## Frontend Integration

### React Hooks

The `/lib/api.ts` file provides custom React hooks for easy data fetching:

#### `usePrice(address, refreshInterval?)`
Fetches and auto-refreshes price data.

```typescript
const { data, loading, error, refetch } = usePrice('0x123...', 5000)
```

#### `useChartData(address, timeframe, from?, to?)`
Fetches chart data for a specific timeframe.

```typescript
const { data, loading, error, refetch } = useChartData('0x123...', '60')
```

#### `useOrderBook(address, basePrice?, refreshInterval?)`
Fetches and auto-refreshes order book data.

```typescript
const { data, loading, error, refetch } = useOrderBook('0x123...', 2845, 2000)
```

#### `useTrades(address, basePrice?, limit?, refreshInterval?)`
Fetches and auto-refreshes recent trades.

```typescript
const { data, loading, error, refetch } = useTrades('0x123...', 2845, 50, 3000)
```

#### `useMarketStats(refreshInterval?)`
Fetches and auto-refreshes global market statistics.

```typescript
const { data, loading, error, refetch } = useMarketStats(5000)
```

---

## Implementation Details

### Price Generation
- Base prices are generated from token address hash for consistency
- Prices vary ±10% around the base price
- Small variations (±0.5%) are applied on each cache refresh

### Chart Data Generation
- Data includes realistic OHLCV patterns
- Slight upward trend bias for visual appeal
- Volatility scales with price magnitude
- Timestamps are properly spaced according to timeframe

### Order Book Generation
- 15 levels on each side (bids/asks)
- Prices spread around base price with realistic gaps
- Amounts are randomized but realistic
- Running totals are calculated correctly

### Trade Generation
- New trades added periodically (~3-5 seconds)
- 50/50 distribution between buys and sells
- Prices vary ±5% around base price
- Maintains realistic trade flow

---

## Future Enhancements

When connecting to real APIs, replace these endpoints with:

1. **Price Data**: CoinGecko, CoinMarketCap, or DEX aggregators
2. **Chart Data**: TradingView DataFeed API or DEX subgraphs
3. **Order Book**: Exchange WebSocket APIs or DEX liquidity data
4. **Trades**: Exchange REST APIs or blockchain event logs
5. **Stats**: Platform-specific analytics APIs

The frontend hooks in `/lib/api.ts` can remain unchanged - just update the API endpoint implementations.
