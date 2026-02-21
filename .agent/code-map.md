# ReelFlip — Code Map

Complete file-by-file reference for the codebase.

## Entry Points

| File | Purpose |
|------|---------|
| `index.js` | App entry — imports `polyfill.js` then `expo-router/entry` |
| `polyfill.js` | Installs `react-native-quick-crypto` for Node.js crypto API |

## App Layer (expo-router)

| File | Purpose | Key exports |
|------|---------|-------------|
| `app/_layout.tsx` | Root layout — wraps `Stack` in `AppProviders` | `RootLayout` (default) |
| `app/index.tsx` | Home screen — shows AppConfig + Account + Network features | `HomeScreen` (default) |

## Components

| File | Purpose | Key exports |
|------|---------|-------------|
| `components/app-providers.tsx` | Composes `QueryClientProvider` → `NetworkProvider` → `MobileWalletProvider` | `AppProviders` |

## Constants

| File | Purpose | Key exports |
|------|---------|-------------|
| `constants/app-config.ts` | App identity (`name`, `uri`) and network list (devnet, testnet) | `AppConfig` (class) |
| `constants/app-styles.ts` | Shared `StyleSheet` — `card`, `screen`, `stack`, `title` | `appStyles` |

## Features — Account

| File | Purpose | Key exports |
|------|---------|-------------|
| `features/account/account-feature-index.tsx` | Barrel — shows connect/disconnect + actions based on wallet state | `AccountFeatureIndex` |
| `features/account/account-feature-connect.tsx` | Connect button — triggers MWA wallet connection | `AccountFeatureConnect` |
| `features/account/account-feature-disconnect.tsx` | Disconnect button | `AccountFeatureDisconnect` |
| `features/account/account-feature-get-balance.tsx` | Displays SOL balance for connected wallet | `AccountFeatureGetBalance` |
| `features/account/account-feature-sign-in.tsx` | Sign-In With Solana (SIWS) flow | `AccountFeatureSignIn` |
| `features/account/account-feature-sign-message.tsx` | Sign arbitrary message | `AccountFeatureSignMessage` |
| `features/account/account-feature-sign-transaction.tsx` | Sign and send a test transaction | `AccountFeatureSignTransaction` |
| `features/account/use-account-get-balance.tsx` | Hook — fetches SOL balance via RPC | `useAccountGetBalance` |

## Features — Network

| File | Purpose | Key exports |
|------|---------|-------------|
| `features/network/network-feature-index.tsx` | Barrel — shows network selector, genesis hash, version | `NetworkFeatureIndex` |
| `features/network/network-provider.tsx` | React context — manages selected cluster, endpoint, explorer URLs | `NetworkProvider`, `NetworkProviderContext` |
| `features/network/network-ui-select.tsx` | Dropdown UI for switching networks | `NetworkUiSelect` |
| `features/network/network-feature-get-genesis-hash.tsx` | Displays genesis hash of selected cluster | `NetworkFeatureGetGenesisHash` |
| `features/network/network-feature-get-version.tsx` | Displays Solana node version | `NetworkFeatureGetVersion` |
| `features/network/use-network.tsx` | Convenience hook — `useContext(NetworkProviderContext)` | `useNetwork` |
| `features/network/use-network-get-genesis-hash.tsx` | Hook — fetches genesis hash via RPC | `useNetworkGetGenesisHash` |
| `features/network/use-network-get-version.tsx` | Hook — fetches node version via RPC | `useNetworkGetVersion` |

## Utils

| File | Purpose | Key exports |
|------|---------|-------------|
| `utils/ellipsify.ts` | Truncates a string (e.g., wallet address) with ellipsis | `ellipsify` |
| `utils/lamports-to-sol.ts` | Converts lamports (u64) to SOL (number) | `lamportsToSol` |

## Config Files

| File | Purpose |
|------|---------|
| `app.json` | Expo config — package `com.reelflip.app`, portrait-only, edge-to-edge, typed routes |
| `tsconfig.json` | TypeScript strict mode, `@/` path alias |
| `package.json` | Dependencies, scripts (see AGENTS.MD for command reference) |
| `.prettierrc` | Prettier config |
| `.prettierignore` | Files excluded from formatting |
| `eslint.config.js` | ESLint config (expo preset) |
| `.gitignore` | Git ignore rules |
