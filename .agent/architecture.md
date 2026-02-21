# ReelFlip - Architecture (Current Implementation)

## Overview

ReelFlip is an Expo-managed React Native app with file-based routing (`expo-router`).
Runtime behavior currently centers on wallet/account actions and network diagnostics.

## Provider Hierarchy

```text
index.js
  -> polyfill.js
    -> expo-router/entry
      -> app/_layout.tsx (RootLayout)
        -> AppProviders
          -> QueryClientProvider
            -> NetworkProvider
              -> MobileWalletProvider
                -> Stack (index screen)
```

Provider order in `components/app-providers.tsx`:

1. `QueryClientProvider` provides React Query context.
2. `NetworkProvider` owns selected Solana cluster state.
3. `MobileWalletProvider` binds wallet operations to selected cluster and app identity.

## Routes

Implemented routes in `app/`:

- `_layout.tsx`: root stack and status bar
- `index.tsx`: home screen with config/account/network sections

No additional route groups or dynamic routes are currently implemented.

## Feature Modules

### Account (`features/account/`)

- Connect/disconnect wallet
- Fetch account SOL balance
- Sign in with wallet
- Sign message
- Sign transaction

### Network (`features/network/`)

- Maintain selected cluster via context
- Select cluster in UI
- Read cluster genesis hash
- Read RPC node version

## Data Flow (Current)

1. Screen components call feature components/hooks.
2. Hooks use React Query for RPC-backed reads.
3. RPC clients are derived from the currently selected network.
4. Wallet actions are executed through `MobileWalletProvider` context.

## External Integrations In Active Use

- Solana RPC endpoints from `constants/app-config.ts`
- Mobile Wallet Adapter through `@wallet-ui/react-native-kit`

No other external market-data or swap APIs are wired in the current codebase.
