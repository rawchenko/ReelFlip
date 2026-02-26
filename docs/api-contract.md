# ReelFlip API Contract (Draft)

Date: February 25, 2026  
Status: Draft for discussion

This document defines the API contract in two scopes:

1. `Implemented now` (authoritative, matches current backend code).
2. `Planned next` (proposal aligned to `docs/system-design.md`, not yet implemented).

## 1) Conventions

- Base path: `/v1` for product APIs.
- Content type: `application/json`.
- Time format: ISO 8601 UTC strings (example: `2026-02-25T19:40:00.000Z`).
- Cursor values are opaque strings (clients must not parse them).
- Error envelope:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "limit must be between 1 and 20."
  }
}
```

### Local development base URL rules

- Android emulator: `http://10.0.2.2:3001`
- Real Android device: `http://<your-mac-lan-ip>:3001`
- iOS simulator / local desktop: `http://127.0.0.1:3001`

## 2) Implemented Now (Source of Truth)

### 2.1 `GET /health`

Purpose: liveness + cache mode check.

Response `200`:

```json
{
  "status": "ok",
  "cacheMode": "redis"
}
```

`cacheMode` enum:
- `redis`
- `memory-fallback`

Errors:
- `500` with error envelope on unexpected server errors.

### 2.2 `GET /v1/feed`

Purpose: paginated token feed with ranking and optional category filter.

Query params:

- `category` (optional): `trending | gainer | new | memecoin`
- `limit` (optional): integer in `[1, FEED_MAX_LIMIT]` (default from `FEED_DEFAULT_LIMIT`; current default is `10`)
- `cursor` (optional): opaque cursor from previous page

Headers in successful responses:

- `X-Cache`: `HIT | MISS | STALE`
- `X-Feed-Source`: `providers | seed`

Response `200`:

```json
{
  "items": [
    {
      "mint": "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
      "name": "Example Token",
      "symbol": "EXMPL",
      "imageUri": null,
      "priceUsd": 0.1234,
      "priceChange24h": 12.4,
      "volume24h": 8450000,
      "liquidity": 2100000,
      "marketCap": 15000000,
      "sparkline": [0.11, 0.113, 0.119, 0.1234],
      "pairAddress": "A1B2C3...",
      "category": "trending",
      "riskTier": "warn"
    }
  ],
  "nextCursor": "eyJzbmFwc2hvdElkIjoiLi4u",
  "generatedAt": "2026-02-25T19:40:00.000Z"
}
```

`TokenFeedItem` schema:

- `mint`: `string`
- `name`: `string`
- `symbol`: `string`
- `imageUri`: `string | null`
- `priceUsd`: `number`
- `priceChange24h`: `number`
- `volume24h`: `number`
- `liquidity`: `number`
- `marketCap`: `number`
- `sparkline`: `number[]`
- `pairAddress`: `string | null`
- `category`: `trending | gainer | new | memecoin`
- `riskTier`: `block | warn | allow`

`nextCursor`:
- `string` when another page exists
- `null` when there are no more items

Error responses:

- `400 BAD_REQUEST` for invalid request shape/semantics.
- `500 INTERNAL` for unexpected server errors.

Current `400` messages emitted by backend:

- `Invalid category. Expected one of: trending, gainer, new, memecoin`
- `limit must be an integer.`
- `limit must be between 1 and <max>.`
- `Cursor is invalid.`
- `Cursor and limit must match.`
- `Cursor and category must match.`
- `Cursor snapshot is no longer valid. Start from the first page.`
- `Cursor offset is out of range.`

## 3) Planned Next (Not Implemented Yet)

Source: `docs/system-design.md` sections 6 and 11.

Planned endpoints:

- `POST /v1/quotes`
- `POST /v1/trades/build`
- `POST /v1/trades/submit`
- `GET /v1/trades/:id/status`
- `POST /v1/auth/challenge`
- `POST /v1/auth/verify`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/portfolio/:wallet`
- `GET /v1/history/:wallet`
- `GET /v1/risk/:mint`

Trade status enum (from system design):
- `pending | simulating | submitted | confirmed | failed`

### 3.1 Proposal Stubs For Discussion

These are draft payload shapes to lock before implementation.

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
  "expiresAt": "2026-02-25T19:45:00.000Z",
  "route": {},
  "riskTier": "warn"
}
```

`POST /v1/trades/build` request:

```json
{
  "quoteId": "qt_123",
  "wallet": "walletPubkeyBase58"
}
```

`POST /v1/trades/build` response:

```json
{
  "tradeIntentId": "ti_123",
  "unsignedTxBase64": "<base64>"
}
```

`POST /v1/trades/submit` request:

```json
{
  "tradeIntentId": "ti_123",
  "signedTxBase64": "<base64>"
}
```

`POST /v1/trades/submit` response:

```json
{
  "tradeId": "tr_123",
  "signature": "solanaTxSignature",
  "status": "submitted"
}
```

`GET /v1/trades/:id/status` response:

```json
{
  "tradeId": "tr_123",
  "status": "confirmed",
  "signature": "solanaTxSignature",
  "updatedAt": "2026-02-25T19:46:00.000Z"
}
```

## 4) Decisions To Lock Before Frontend/Backend Expansion

1. Nullability contract: keep `imageUri` / `pairAddress` as nullable (`null`) or switch to optional/omitted fields.
2. Category naming: keep `gainer` (current code) or migrate to `gainers` consistently.
3. Numeric encoding: use JSON numbers vs decimal strings for money/amounts in quote/trade endpoints.
4. Auth scope: confirm whether feed remains public and which endpoints require SIWS access token.
5. Idempotency: require idempotency key on trade build/submit.
6. Error code taxonomy: finalize canonical codes beyond `BAD_REQUEST` and `INTERNAL` (for example `UNAUTHORIZED`, `RATE_LIMITED`, `QUOTE_EXPIRED`, `RISK_BLOCKED`).
7. Versioning rule: define how breaking changes are introduced (`/v1` discipline vs `/v2` cutover).

