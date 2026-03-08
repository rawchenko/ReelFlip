# ReelFlip — MVP Spec

Date: 2026-02-27 (updated 2026-03-08)
Status: In Progress

## 1. MVP Goal

Let the user quickly experience "browse tokens -> open token -> execute a real swap -> see the result in Activity", with minimal onboarding via Seeker wallet connection.

## 2. Scope

### In scope (MVP)

- **Wallet onboarding:** connect (Seeker) + terms + trading defaults (slippage / base currency).
- **Navigation:** 3 tabs (`Feed`, `Activity`, `Profile`) + stack screens (`Search`, `Token Details`, `Transaction Details`, `Settings`) + `Swap` as a popup modal.
- **Feed:** token feed with segments `For You / Trending / Watchlist` + Search button in header.
- **Search:** full search screen with results list.
- **Token Details:** chart + metrics + Watchlist toggle + Buy / Sell.
- **Swap modal:** Buy/Sell, amount, pay token selector `SOL / USDC / SKR`, slippage, review, signing, status.
- **Activity:** `Swaps / Transfers` events only, grouped by date, 30-day history, tap -> Tx details. Swaps show both legs (e.g. `-1.34 SOL` and `+23.34 SKR`).
- **Profile:** wallet summary + `Holdings` and `Watchlist (manage)` tabs + Settings icon (top-right).
- **Watchlist:** server-side source of truth (linked to wallet), management UI in Profile.

### Out of scope

- Comments / threads.
- Advanced discovery (complex filters, personalization beyond basic "For You").
- Fiat (USD) values in Activity (can add later).
- Custom on-chain transaction normalization (in MVP — use Helius).
- Token launch / bonding curve / graduation mechanics.

## 3. Navigation Flow

```mermaid
flowchart LR
  A["App Start"] --> Gate{"Onboarding done?"}
  Gate -->|"No"| OB["Onboarding (Stack)"]
  Gate -->|"Yes"| Tabs["Tabs"]

  subgraph Tabs["Tabs: Feed / Activity / Profile"]
    Feed["Feed (Tab)"]
    Activity["Activity (Tab)"]
    Profile["Profile (Tab)"]
  end

  Feed --> FeedSeg["Segments: For You / Trending / Watchlist"]
  Feed --> SearchBtn["Header: Search icon"]
  SearchBtn --> Search["Search (Stack Screen)"]
  Search --> SearchRes["Results list"]

  FeedSeg --> TD["Token Details (Stack Screen)"]
  SearchRes --> TD
  Profile --> Holdings["Holdings (tab)"]
  Profile --> WLManage["Watchlist manage (tab)"]
  Holdings --> TD
  WLManage --> TD

  FeedSeg --> Swap["Swap Modal (Popup)"]
  SearchRes --> Swap
  TD --> Swap
  Swap -. "return to origin" .-> Feed
  Swap -. "return to origin" .-> Search
  Swap -. "return to origin" .-> TD

  Activity --> TxList["Activity list (Swaps/Transfers)"]
  TxList --> TxD["Transaction Details (Stack Screen)"]
  Swap -->|"View receipt"| TxD

  Profile --> SettingsIcon["Settings icon"]
  SettingsIcon --> Settings["Settings (Stack Screen)"]
```

## 4. Screens

State notation: `L` = loading, `E` = empty, `X` = error.

### 4.1 Onboarding (Stack) — DONE

Steps: `Welcome -> Connect Wallet (Seeker) -> Terms/Permissions -> Defaults -> Enter App`

States: `X` (connection error) + retry.

Actions: Connect wallet, Accept terms, Set defaults (slippage, base currency).

### 4.2 Feed (Tab) — DONE

Segments: `For You / Trending / Watchlist`. Header: Search icon. Token Card: tap -> Token Details, Buy/Sell -> Swap modal.

States: `L` (initial load), `E` (no items / watchlist empty), `X` (network error) + retry.

> Note: Buy/Sell button currently opens a placeholder sheet. Real swap flow is not yet wired.

### 4.3 Search (Stack Screen) — TODO

Search input + Results list: tap -> Token Details, Buy/Sell quick -> Swap modal.

States: `E` (no results), `X` (network error) + retry.

### 4.4 Token Details (Stack Screen) — PARTIAL

Chart with time ranges (1H / 1D / 1W minimum). Metrics: volume, market cap, price change. Actions: watchlist toggle, buy, sell.

States: `L` (loading details), `X` + retry.

> Note: Chart and realtime streaming are implemented. Metrics display and watchlist toggle are partial. Buy/Sell -> Swap modal is not yet wired.

### 4.5 Swap Modal (Popup) — TODO

Entry points: Feed card, Search results, Token Details.

Steps: (1) Setup: side (Buy/Sell) + amount, (2) Pay with: SOL / USDC / SKR, (3) Slippage (presets + custom), (4) Review and confirm, (5) Signing (Seeker), (6) Result: success / fail + retry.

After success/close, return to origin screen. "View receipt" button navigates to Transaction Details.

States: `L` (quoting/building), `X` (quote/build/sign/send error).

> Note: Backend trade stubs exist (`/trade/` module) but endpoints are not registered. Jupiter integration code exists but is not wired end-to-end.

### 4.6 Activity (Tab) — IN PROGRESS

Scope: `Swaps / Transfers` only, 30 days. Grouping: `Today`, `This Week`, `Earlier`. Swap row shows both legs. Transfer row shows one leg + counterparty. Tap -> Transaction Details.

States: `L`, `E`, `X` + retry.

> Note: Backend `GET /v1/activity` endpoint is implemented via Helius. Frontend has type definitions and mock UI. Live data integration is in progress (REE-9).

### 4.7 Transaction Details (Stack Screen) — TODO

Status, amounts, tokens, tx hash (copy), fee, timestamp. Optional "View on explorer" link.

States: `L`, `X` + retry.

### 4.8 Profile (Tab) — PARTIAL

Header: wallet summary (.skr name, address copy) + Settings icon. Tabs: Holdings (token/asset list, tap -> Token Details), Watchlist manage (remove/unwatch, tap -> Token Details).

> Note: Placeholder UI exists. Wallet summary, Holdings via Helius, and Watchlist management are not yet implemented.

### 4.9 Settings (Stack Screen) — TODO

Settings: slippage default, base currency, disconnect wallet.

## 5. Data Contracts

### 5.1 FeedItem (Token card)

```typescript
interface FeedItem {
  mint: string
  symbol: string
  name: string
  imageUri?: string
  pairAddress?: string
  priceUsd?: number
  priceChange24h?: number
  marketCap?: number
  volume24h?: number
  liquidity?: number
  sparkline?: number[]
  sparklineMeta?: {
    window: '6h'
    interval: '1m' | '5m'
    source: string
    points: number
    generatedAt: string
  }
  tags?: { trust: string[]; discovery: string[] }
  labels?: string[]
  category?: string
  riskTier?: 'block' | 'warn' | 'allow'
  sources?: { price: string; marketCap: string; metadata: string; tags: string[] }
}
```

### 5.2 ActivityEvent (UI model)

```typescript
interface ActivityEvent {
  id: string          // txid + index
  txid: string
  timestamp: string   // ISO 8601
  status: 'confirmed' | 'failed'
  kind: 'swap' | 'transfer'
  primary: {
    mint: string
    symbol: string
    amount: string
    direction: 'in' | 'out'
  }
  secondary?: {       // for swaps
    mint: string
    symbol: string
    amount: string
    direction: 'in' | 'out'
  }
  counterparty?: {    // for transfers
    address: string
    label?: string
  }
}
```

### 5.3 SwapDraft (UI state)

```typescript
interface SwapDraft {
  side: 'buy' | 'sell'
  tokenMint: string
  payToken: 'SOL' | 'USDC' | 'SKR'
  amount: string
  slippageBps: number
}
```

### 5.4 UserSettings

```typescript
interface UserSettings {
  slippageBps: number
  baseCurrency: 'USD' | 'EUR' | string
  defaultPayToken?: 'SOL' | 'USDC' | 'SKR'
}
```

### 5.5 WatchlistEntry

```typescript
interface WatchlistEntry {
  mint: string
  addedAt: string     // ISO 8601
}
```

## 6. Backend API Summary

Full API details: see [api-contract.md](./api-contract.md).

Implemented: `GET /health`, `GET /v1/feed`, `GET /v1/activity`, Chart endpoints (REST + WebSocket + SSE).

Planned for MVP: Auth (`/v1/auth/*`), Swap (`/v1/quotes`, `/v1/trades/*`), Search (`/v1/search`), Watchlist (`/v1/watchlist`), Settings (`/v1/settings`).

## 7. Swap Flow (Sequence)

```mermaid
sequenceDiagram
  participant U as User
  participant App as Mobile App
  participant API as Backend API
  participant J as Jupiter
  participant W as Seeker Wallet
  participant RPC as Solana RPC

  U->>App: Tap Buy/Sell (origin: Feed/Search/Details)
  App->>API: POST /v1/quotes (draft params)
  API->>J: Quote request
  J-->>API: Quote response
  API-->>App: Quote (quoteId + preview)
  U->>App: Confirm
  App->>API: POST /v1/trades/build (quoteId)
  API->>J: Build swap instructions / tx payload
  J-->>API: Instructions / payload
  API-->>App: Instructions / payload
  App->>W: Sign (Seeker)
  W-->>App: Signature
  App->>RPC: Send transaction
  RPC-->>App: txid
  App-->>U: Show pending + View receipt
```

## 8. Acceptance Criteria (MVP)

- User completes onboarding and lands on Feed.
- Feed shows `For You / Trending / Watchlist` segments and a Search button.
- User can open Token Details from Feed, Search, or Profile (Holdings / Watchlist).
- User can open Swap modal from Feed card, Search results, or Token Details.
- After successful swap: modal closes -> return to origin screen; "View receipt" button -> Transaction Details; event appears in Activity within reasonable delay.
- Activity shows only swaps/transfers for 30 days, grouped by date, swaps displayed with both legs.

## 9. Open Questions

- Chart format (candles vs sparkline) and time intervals for Token Details.
- Cache/pagination policy for Feed and Activity.
- "For You" ranking algorithm (initial versions can use simple rules).
- Watchlist API: server-side storage design (linked to wallet address vs auth token).
