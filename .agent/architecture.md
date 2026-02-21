# ReelFlip — Architecture

## Overview

ReelFlip is an Expo-managed React Native app targeting Android (Solana Seeker). It uses file-based routing via `expo-router` and connects to Solana wallets through Mobile Wallet Adapter (MWA).

## Provider Hierarchy

```
index.js
  └── polyfill.js (react-native-quick-crypto)
      └── expo-router/entry
          └── app/_layout.tsx (RootLayout)
              └── AppProviders
                  ├── QueryClientProvider (@tanstack/react-query)
                  │   └── NetworkProvider (context: cluster, endpoint, explorer)
                  │       └── MobileWalletProvider (wallet connection, signing)
                  │           └── Stack (expo-router)
                  │               └── Screens...
```

The provider order matters:
1. **QueryClientProvider** — must wrap everything that uses `useQuery`
2. **NetworkProvider** — selects which Solana cluster (devnet/testnet/mainnet) is active
3. **MobileWalletProvider** — binds wallet identity + cluster for MWA sessions

## Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   UI Screen  │────▶│  React Query │────▶│  @solana/kit  │
│  (feature)   │     │   useQuery   │     │   RPC calls   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                                         │
       ▼                                         ▼
┌──────────────┐                        ┌──────────────┐
│ useMobileWal │                        │  Solana RPC   │
│    let()     │                        │   Endpoint    │
└──────────────┘                        └──────────────┘
       │
       ▼
┌──────────────┐
│  MWA Wallet  │
│   (Phantom,  │
│    etc.)     │
└──────────────┘
```

## Feature Module Pattern

Each domain lives in `features/{name}/` with these conventions:

| File pattern | Purpose |
|---|---|
| `{name}-feature-index.tsx` | Barrel component that composes sub-features |
| `{name}-feature-{action}.tsx` | Individual feature component (e.g., connect, sign) |
| `use-{name}-{action}.tsx` | Custom hook encapsulating data fetching / mutations |
| `{name}-provider.tsx` | Context provider (if the feature needs shared state) |
| `{name}-ui-{part}.tsx` | Presentational UI sub-component |

## Planned Architecture (TikTok-style feed)

### New Feature Modules to Build

```
features/
├── feed/                   # Core vertical-swipe token feed
│   ├── feed-feature-index.tsx
│   ├── feed-card.tsx           # Individual token card (chart + actions)
│   ├── feed-provider.tsx       # Feed state (current index, preloading)
│   └── use-feed-tokens.tsx     # Fetch trending/hot tokens
├── trade/                  # Buy/sell execution
│   ├── trade-feature-buy.tsx
│   ├── trade-feature-sell.tsx
│   ├── trade-provider.tsx      # Active trade state
│   └── use-trade-execute.tsx   # Transaction building + signing
├── token/                  # Token details & charts
│   ├── token-feature-detail.tsx
│   ├── token-chart.tsx
│   └── use-token-price.tsx
└── portfolio/              # User holdings overview
    ├── portfolio-feature-index.tsx
    └── use-portfolio.tsx
```

### New Routes

```
app/
├── _layout.tsx                 # Root: AppProviders + Tab navigator
├── (tabs)/
│   ├── _layout.tsx             # Bottom tab bar
│   ├── index.tsx               # Feed screen (main)
│   ├── portfolio.tsx           # Portfolio screen
│   └── settings.tsx            # Settings / wallet screen
└── token/[mint].tsx            # Token detail (deep link support)
```

## External APIs (Planned)

| API | Purpose | Notes |
|-----|---------|-------|
| Jupiter | Token swaps | Preferred DEX aggregator on Solana |
| DexScreener / Birdeye | Price data, charts, trending tokens | Free tier may suffice for hackathon |
| Helius / Solana RPC | On-chain data, token metadata | Need reliable RPC for live trading |

## Key Design Decisions

1. **Expo managed workflow** — avoids native build complexity during hackathon
2. **expo-router** for file-based routing — clean deep-link support for token pages
3. **@solana/kit** (v5) over legacy `@solana/web3.js` — modern, tree-shakeable
4. **react-native-reanimated** + **gesture-handler** — native-level swipe performance
5. **react-query** for all server state — automatic caching, background refetch, stale-while-revalidate
