# ReelFlip API Contract

Date: 2026-02-25 (updated 2026-03-08)
Status: Living document

This document defines the API contract split into two sections:

1. **Implemented** — matches current backend code and is authoritative.
2. **Planned for MVP** — proposal, not yet implemented.

## 1. Conventions

- Base path: `/v1` for product APIs.
- Content type: `application/json`.
- Time format: ISO 8601 UTC strings (e.g. `2026-02-25T19:40:00.000Z`).
- Cursor values are opaque strings (clients must not parse them).
- Nullability: fields marked `T | null` are always present in the response but may be `null`. Optional fields (`T?`) may be omitted entirely.
- Numeric encoding: all prices, amounts, and market values are JSON `number` in REST responses. Swap/trade amounts use decimal `string` to avoid precision loss.
- Error envelope:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "limit must be between 1 and 20."
  }
}
```

Error codes: `BAD_REQUEST`, `INTERNAL`, `NOT_FOUND`, `UNAUTHORIZED` (planned), `RATE_LIMITED`, `QUOTE_EXPIRED` (planned), `RISK_BLOCKED` (planned).

### Local development base URL rules

- Android emulator: `http://10.0.2.2:3001`
- Real Android device: `http://<your-mac-lan-ip>:3001`
- iOS simulator / local desktop: `http://127.0.0.1:3001`

---

## 2. Implemented Endpoints

### 2.1 `GET /health`

Liveness + cache mode check.

**Response 200:**

```json
{
  "status": "ok",
  "cacheMode": "redis" | "memory-fallback"
}
```

### 2.2 `GET /v1/feed`

Paginated token feed with ranking and optional category filter.

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `category` | `trending \| gainer \| new \| memecoin` | no | all | Filter by category |
| `minLifetimeHours` | integer 0-8760 | no | - | Min pair age filter |
| `limit` | integer 1-20 | no | 10 | Page size |
| `cursor` | string | no | - | Pagination cursor |

**Response headers:** `X-Cache: HIT | MISS | STALE`, `X-Feed-Source: providers | seed`

**Response 200:**

```json
{
  "items": [TokenFeedItem],
  "nextCursor": "string | null",
  "generatedAt": "ISO 8601"
}
```

**TokenFeedItem:**

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `string` | Token mint address |
| `name` | `string` | Token name |
| `symbol` | `string` | Token symbol |
| `description` | `string \| null` | Token description |
| `imageUri` | `string \| null` | Token image URL |
| `priceUsd` | `number` | Current USD price |
| `priceChange24h` | `number` | 24h price change % |
| `volume24h` | `number` | 24h volume USD |
| `liquidity` | `number` | Liquidity USD |
| `marketCap` | `number \| null` | Market cap USD |
| `sparkline` | `number[]` | 6h sparkline values |
| `sparklineMeta` | `object \| null` | `{ window, interval, source, points, generatedAt }` |
| `pairAddress` | `string \| null` | Primary trading pair |
| `pairCreatedAtMs` | `number \| null` | Pair creation Unix ms |
| `tags` | `object` | `{ trust: string[], discovery: string[] }` |
| `labels` | `string[]` | Backward-compat alias of `tags.discovery` |
| `sources` | `object` | `{ price, marketCap, metadata, tags }` — provenance |
| `category` | `string` | Category classification |
| `riskTier` | `block \| warn \| allow` | Risk assessment |

**Errors:** `400 BAD_REQUEST` (invalid params), `500 INTERNAL`.

### 2.3 `GET /v1/activity`

Wallet transaction history via Helius.

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `walletAddress` | string (Base58, 32-44 chars) | yes | - | Wallet public key |
| `days` | integer 1-90 | no | 30 | History window |
| `cursor` | string | no | - | Pagination cursor |

**Response 200:**

```json
{
  "events": [ActivityEvent],
  "nextCursor": "string | undefined"
}
```

**ActivityEvent:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique event ID (txid + index) |
| `txid` | `string` | Solana transaction signature |
| `timestamp` | `string` | ISO 8601 |
| `status` | `confirmed \| failed` | Transaction status |
| `kind` | `swap \| transfer` | Event type |
| `primary` | `{ mint, symbol, amount, direction }` | Primary token leg |
| `secondary` | `{ mint, symbol, amount, direction } \| undefined` | Second leg (swaps) |
| `counterparty` | `{ address, label? } \| undefined` | Counterparty (transfers) |

### 2.4 `GET /v1/chart/:pairAddress`

Historical chart data for a single pair.

**Path params:** `pairAddress` (required).

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `interval` | `1s \| 1m` | no | `1m` | Candle interval |
| `limit` | integer 1-360 | no | 120 | Max data points |

**Response 200:**

```json
{
  "pairAddress": "string",
  "interval": "1m",
  "generatedAt": "ISO 8601",
  "source": "string",
  "delayed": false,
  "historyQuality": "real_backfill | runtime_only | partial | unavailable",
  "points": [{ "time": 1234567890, "value": 0.1234 }]
}
```

### 2.5 `POST /v1/chart/batch`

Batch chart history for multiple pairs.

**Request body:**

```json
{
  "pairs": ["pairAddress1", "pairAddress2"],
  "interval": "1m",
  "limit": 120
}
```

**Response 200:**

```json
{
  "interval": "1m",
  "generatedAt": "ISO 8601",
  "results": [{
    "pairAddress": "string",
    "delayed": false,
    "status": "live | delayed | reconnecting | fallback_polling",
    "source": "string",
    "historyQuality": "real_backfill | runtime_only | partial | unavailable",
    "points": [{ "time": 1234567890, "value": 0.1234 }]
  }]
}
```

### 2.6 `GET /v1/chart/stream` (Server-Sent Events)

Realtime chart streaming.

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `pairs` | string (comma-separated) | yes | Pair addresses to subscribe |
| `interval` | `1s \| 1m` | no | Candle interval (default: `1m`) |

**Header:** `last-event-id` (optional) for stream resumption.

**Event types:** `snapshot`, `point_update`, `status`, `heartbeat` (every 15s).

### 2.7 `WS /v1/chart/ws` (WebSocket)

Preferred realtime transport. Same event types as SSE (`snapshot`, `point_update`, `status`, `heartbeat`).

Client sends subscribe messages with pair addresses; server streams chart events.

### 2.8 `GET /v1/image/proxy`

Proxies token images with size and content-type validation.

### 2.9 `GET /metrics`

Backend operational metrics (feed, supabase, ingest, chart counters).

---

## 3. Planned for MVP (Not Yet Implemented)

### 3.1 Auth (SIWS — Sign In With Solana)

- `POST /v1/auth/challenge` -> `{ messageToSign, nonce, expiresAt }`
- `POST /v1/auth/verify` `{ address, signature, nonce }` -> `{ token }`

Feed and Chart endpoints remain public. Auth required for: Watchlist, Settings, Swap.

### 3.2 Swap / Trade

- `POST /v1/quotes` — Get Jupiter swap quote
- `POST /v1/trades/build` — Build unsigned transaction
- `POST /v1/trades/submit` — Submit signed transaction
- `GET /v1/trades/:id/status` — Poll trade status

Trade status enum: `pending | simulating | submitted | confirmed | failed`

**Draft payload shapes:** see [mvp.md](./mvp.md) section 7 for sequence diagram.

`POST /v1/quotes` request:
```json
{
  "wallet": "walletPubkeyBase58",
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "tokenMintBase58",
  "amount": "100000000",
  "slippageBps": 100
}
```

`POST /v1/quotes` response:
```json
{
  "quoteId": "qt_123",
  "expiresAt": "ISO 8601",
  "route": {},
  "riskTier": "warn"
}
```

`POST /v1/trades/build` request: `{ "quoteId": "qt_123", "wallet": "..." }`
`POST /v1/trades/build` response: `{ "tradeIntentId": "ti_123", "unsignedTxBase64": "..." }`

`POST /v1/trades/submit` request: `{ "tradeIntentId": "ti_123", "signedTxBase64": "..." }`
`POST /v1/trades/submit` response: `{ "tradeId": "tr_123", "signature": "...", "status": "submitted" }`

`GET /v1/trades/:id/status` response: `{ "tradeId": "tr_123", "status": "confirmed", "signature": "...", "updatedAt": "..." }`

### 3.3 Search

- `GET /v1/search?q=...` — Token search with autocomplete

### 3.4 Watchlist (requires auth)

- `GET /v1/watchlist` — Get user's watchlist
- `POST /v1/watchlist` `{ mint }` — Add token
- `DELETE /v1/watchlist/:mint` — Remove token

### 3.5 Settings (requires auth)

- `GET /v1/settings` — Get user settings
- `PUT /v1/settings` `{ slippageBps, baseCurrency, defaultPayToken? }` — Update settings

---

## 4. Decisions Locked

1. **Nullability:** `imageUri` and `pairAddress` are nullable (`T | null`), always present in response.
2. **Category naming:** `gainer` (singular) is canonical. Keep as-is.
3. **Numeric encoding:** REST uses JSON numbers; swap amounts use decimal strings.
4. **Auth scope:** Feed and Chart are public. Watchlist, Settings, and Trade require SIWS token.
5. **Idempotency:** Required on `POST /v1/trades/submit` via `Idempotency-Key` header.
6. **API versioning:** `/v1` prefix. Breaking changes get `/v2`; additive changes stay in `/v1`.
