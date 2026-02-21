# ReelFlip - Code Map (Current)

Current map of implemented source files plus key project support files.

## Entry Points

| File | Purpose |
|------|---------|
| `index.js` | App entry; imports `polyfill` then `expo-router/entry` |
| `polyfill.js` | Installs `react-native-quick-crypto` polyfill |

## App Routes

| File | Purpose | Exports |
|------|---------|---------|
| `app/_layout.tsx` | Root layout with `AppProviders` and stack config | default `RootLayout` |
| `app/index.tsx` | Home screen that renders config/account/network features | default `HomeScreen` |

## Components

| File | Purpose | Exports |
|------|---------|---------|
| `components/app-providers.tsx` | Composes query, network, and wallet providers | `AppProviders` |

## Constants

| File | Purpose | Exports |
|------|---------|---------|
| `constants/app-config.ts` | App identity + supported Solana clusters | `AppConfig` |
| `constants/app-styles.ts` | Shared card/screen/stack/title styles | `appStyles` |

## Features - Account

| File | Purpose | Exports |
|------|---------|---------|
| `features/account/account-feature-index.tsx` | Account section composition | `AccountFeatureIndex` |
| `features/account/account-feature-connect.tsx` | Wallet connect action | `AccountFeatureConnect` |
| `features/account/account-feature-disconnect.tsx` | Wallet disconnect action | `AccountFeatureDisconnect` |
| `features/account/account-feature-get-balance.tsx` | Balance display component | `AccountFeatureGetBalance` |
| `features/account/account-feature-sign-in.tsx` | Wallet sign-in action | `AccountFeatureSignIn` |
| `features/account/account-feature-sign-message.tsx` | Sign arbitrary message action | `AccountFeatureSignMessage` |
| `features/account/account-feature-sign-transaction.tsx` | Sign transaction action | `AccountFeatureSignTransaction` |
| `features/account/use-account-get-balance.tsx` | Balance query hook | `useAccountGetBalance` |

## Features - Network

| File | Purpose | Exports |
|------|---------|---------|
| `features/network/network-feature-index.tsx` | Network section composition | `NetworkFeatureIndex` |
| `features/network/network-provider.tsx` | Cluster state context/provider | `NetworkProvider`, `NetworkProviderContext` |
| `features/network/network-ui-select.tsx` | Cluster selection control | `NetworkUiSelect` |
| `features/network/network-feature-get-genesis-hash.tsx` | Genesis hash display | `NetworkFeatureGetGenesisHash` |
| `features/network/network-feature-get-version.tsx` | RPC version display | `NetworkFeatureGetVersion` |
| `features/network/use-network.tsx` | Network context hook | `useNetwork` |
| `features/network/use-network-get-genesis-hash.tsx` | Genesis hash query hook | `useNetworkGetGenesisHash` |
| `features/network/use-network-get-version.tsx` | RPC version query hook | `useNetworkGetVersion` |

## Utilities

| File | Purpose | Exports |
|------|---------|---------|
| `utils/ellipsify.ts` | Shortens long strings for display | `ellipsify` |
| `utils/lamports-to-sol.ts` | Converts lamports to SOL numeric value | `lamportsToSol` |

## Docs and Build Notes

| File | Purpose |
|------|---------|
| `docs/android-dev.md` | Android development notes |
| `docs/gradle-warning-blockers.md` | Known Gradle warning/blocker notes |

## Expo Plugin and Patches

| Path | Purpose |
|------|---------|
| `plugins/with-node-binary-gradle.js` | Config plugin for node binary handling in Android Gradle files |
| `patches/*.patch` | patch-package overrides applied on install |

## Top-Level Config and Metadata

| File | Purpose |
|------|---------|
| `app.json` | Expo config (Android package, plugins, experiments) |
| `package.json` | Scripts/dependencies |
| `tsconfig.json` | TS strict config + `@/` alias |
| `eslint.config.js` | ESLint setup |
| `.prettierrc` | Prettier rules |
| `.prettierignore` | Prettier ignore list |
| `expo-env.d.ts` | Expo environment typings |
