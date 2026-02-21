# ReelFlip — Agent Guide

> TikTok-style crypto trading app built on Solana Mobile for the **Monolith Hackathon**.

## Context Files

| File | Purpose | When to read |
|------|---------|-------------|
| `.agent/context.md` | Hackathon rules, deadlines, judging criteria, submission requirements | Before planning features or prioritizing work |
| `.agent/architecture.md` | App architecture, provider hierarchy, data flow, APIs | Before adding new features or modifying providers |
| `.agent/code-map.md` | Complete file-by-file map of the codebase | When navigating unfamiliar code or adding new modules |
| `.agent/design.md` | UI/UX design system, color palette, component patterns | Before building or styling any UI component |
| `constants/app-config.ts` | App identity, network configuration | When changing wallet or RPC settings |
| `constants/app-styles.ts` | Shared StyleSheet definitions | When reusing or extending base styles |
| `package.json` | Dependencies and scripts | Before adding packages or running commands |
| `app.json` | Expo configuration, plugins, Android package name | When changing build settings or splash screen |

## Commands

```bash
# Development
npm run dev              # Start Expo dev server (clears cache)
npm run start            # Start Expo (no cache clear)

# Build
npm run android          # Run on Android device/emulator
npm run android:build    # Prebuild Android native project
npm run build            # Type-check + prebuild Android

# Quality
npm run lint             # Lint with auto-fix
npm run lint:check       # Lint (check only)
npm run fmt              # Format with Prettier
npm run fmt:check        # Check formatting
npm run ci               # Full CI: type-check + lint + format + build

# Diagnostics
npm run doctor           # Run expo-doctor
```

## Project Structure

```
ReelFlip/
├── app/                        # Expo Router screens (file-based routing)
│   ├── _layout.tsx             # Root layout — wraps Stack in AppProviders
│   └── index.tsx               # Home screen entry point
├── components/                 # Shared top-level components
│   └── app-providers.tsx       # QueryClient + NetworkProvider + MobileWalletProvider
├── constants/                  # App-wide configuration
│   ├── app-config.ts           # Identity (name, uri) + Solana network list
│   └── app-styles.ts           # Base StyleSheet (card, screen, stack, title)
├── features/                   # Feature modules (domain grouping)
│   ├── account/                # Wallet connect, disconnect, balance, sign operations
│   │   ├── account-feature-connect.tsx
│   │   ├── account-feature-disconnect.tsx
│   │   ├── account-feature-get-balance.tsx
│   │   ├── account-feature-index.tsx
│   │   ├── account-feature-sign-in.tsx
│   │   ├── account-feature-sign-message.tsx
│   │   ├── account-feature-sign-transaction.tsx
│   │   └── use-account-get-balance.tsx
│   └── network/                # RPC network selection and status
│       ├── network-feature-get-genesis-hash.tsx
│       ├── network-feature-get-version.tsx
│       ├── network-feature-index.tsx
│       ├── network-provider.tsx
│       ├── network-ui-select.tsx
│       ├── use-network-get-genesis-hash.tsx
│       ├── use-network-get-version.tsx
│       └── use-network.tsx
├── utils/                      # Pure utility functions
│   ├── ellipsify.ts            # Truncate addresses with "…"
│   └── lamports-to-sol.ts      # SOL conversion helper
├── assets/images/              # Icons, splash, favicons
├── android/                    # Native Android project (prebuild output)
├── index.js                    # Entry — loads polyfill then expo-router
├── polyfill.js                 # react-native-quick-crypto install
├── app.json                    # Expo config
├── package.json                # Dependencies and scripts
└── tsconfig.json               # TypeScript config (strict, @/ alias)
```

## Code Style

- **Language**: TypeScript (strict mode) with React Native / Expo
- **Formatting**: Prettier (see `.prettierrc`)
- **Linting**: ESLint with `eslint-config-expo`
- **Imports**: Use `@/` path alias (maps to project root)
- **Components**: Named exports, functional components only
- **Naming**:
  - Files: `kebab-case.tsx` (e.g., `account-feature-connect.tsx`)
  - Components: `PascalCase` (e.g., `AccountFeatureConnect`)
  - Hooks: `use-*.tsx` files, `useCamelCase` functions
  - Feature modules: `{feature}-feature-{action}.tsx` pattern
- **Feature organization**: Group by domain in `features/{domain}/`
  - Each feature has `*-feature-index.tsx` as the barrel/entry component
  - Hooks are co-located with their feature
- **State management**: React Query (`@tanstack/react-query`) for server state
- **Wallet**: Mobile Wallet Adapter via `@wallet-ui/react-native-kit`
- **Styling**: `StyleSheet.create()` objects — no inline styles for reusable patterns
- **No default exports** except for Expo Router screen components in `app/`
