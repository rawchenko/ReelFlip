# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ReelFlip is a TikTok-style crypto trading app on Solana — a vertical feed of live tokens with realtime charts and swap execution. Built with **Expo 54 / React Native 0.81** (mobile app) and a **Fastify v5 backend** in a monorepo layout.

## Commands

### Mobile App
```bash
npm install                   # Install deps (runs patch-package via postinstall)
npm run dev                   # Expo dev server (clears cache)
npm run android               # Run on Android emulator
npm run ios                   # Run on iOS simulator
npx tsc --noEmit              # Type-check
npm run lint:check            # Lint (no fix)
npm run lint                  # Lint with auto-fix
npm run fmt:check             # Prettier check
npm run fmt                   # Prettier fix
npm run ci                    # Full CI gate: tsc + lint + fmt + android prebuild
npm run verify:local          # CI + Android debug APK build
```

### Backend
```bash
npm --prefix backend install
npm run backend:dev           # Hot-reload dev server (tsx watch)
npm run backend:build         # Compile to dist/
npm run backend:start         # Run compiled build
npm run backend:test          # Node built-in test runner (tsx --test)
```

### Daily Dev Loop
```bash
npm run dev:up                # Starts backend, waits for health check, then Metro
npm run android               # In a second terminal
npm run dev:check             # Health/status checks
npm run dev:logs              # Tail logs
npm run dev:down              # Teardown
```

## Architecture

### Provider Tree (top → bottom)
`QueryClientProvider` → `NetworkProvider` (Solana cluster) → `MobileWalletProvider` → `OnboardingProvider` (AsyncStorage, 5-stage) → expo-router Stack

### Navigation (expo-router file-based)
- Root Stack: `index` → `onboarding` stages → `(tabs)` → `tx-details`
- Tab group `(tabs)`: `feed`, `activity`, `profile`
- Custom `CustomTabBar` replaces default tab bar
- `(tabs)/_layout.tsx` redirects to onboarding if not completed

### State Management
- **Server data**: `@tanstack/react-query` (queries, infinite queries, manual cache writes)
- **Realtime charts**: `FeedChartStore` — singleton class using `useSyncExternalStore`
- **Onboarding**: React context + AsyncStorage
- **Network/cluster**: React context
- **Wallet**: `@wallet-ui/react-native-kit`
- **Local UI**: `useState` / `useRef`
- No Redux, Zustand, or MobX.

### Feed Data Flow
1. `useFeedQuery` polls `GET /v1/feed` every 5s
2. `VerticalFeed` renders full-screen paging `FlatList`
3. Active card index drives `useFeedChartRealtime` (subscribes ±1 surrounding cards)
4. Chart transport: WebSocket → SSE fallback → history polling fallback
5. `FeedChartStore.hydrateHistory` / `applyPointUpdate` → components read via `useChartPairState`

### Swap Flow
`handleTradePress` → `FeedInteractionOverlays` Modal → `apiSwapQuoteAdapter` calls `/v1/quotes`, `/v1/trades/build`, `/v1/trades/submit` → on success navigates to `tx-details`

### Backend
- Fastify v5, TypeScript, ESM. Node built-in test runner (no Jest/Vitest).
- Redis for cache + Redis Streams for realtime chart events; in-memory fallback.
- Supabase Postgres optional (feature-flagged).
- API: `/v1/feed`, `/v1/chart/*`, `/v1/activity`, `/v1/trades/*`, `/health`, `/metrics`

## Design System

### Two-Layer Color Architecture
1. **Primitives** (`constants/palette.ts`): Raw color scales (neutral, gray, yellow, red, green) + alpha helpers. **Never reference directly in components.**
2. **Semantic tokens** (`constants/semantic-colors.ts`): `semanticColors.app.*`, `.text.*`, `.icon.*`, `.accent.*`, `.surface.*`, `.status.*`, `.chart.*`, `.button.*`, `.border.*`, `.tabBar.*`. **All components import from semantic-colors only.**

### Feature-Level Design Specs
Each feature has a co-located `*-design-spec.ts` with layout tokens (padding, heights, colors referencing semanticColors). These are plain objects, not StyleSheets.

### Typography
```ts
import { interFontFamily, spaceGroteskFamily } from '@/constants/typography'
// Inter (body/UI): .regular, .medium, .bold, .extraBold, .black
// Space Grotesk (display/headings): .medium, .semiBold, .bold
```
Inter is set as the app-wide default font via `Text.defaultProps` in `_layout.tsx`.

### Spacing & Radii
```ts
import { spacing, radii, iconSize } from '@/constants/spacing'
// spacing: base 4px scale — spacing[4] = 16px, spacing[6] = 24px
// radii: sm(8), md(12), lg(16), xl(22), full(999)
// iconSize: xs(16), sm(20), md(24), lg(32), xl(48)
```

## Conventions

### Imports
Use `@/*` absolute imports (maps to repo root). No relative imports across feature boundaries.

### TypeScript
- `strict: true`. Inline interfaces for component props. Types file per feature: `features/*/types.ts`.

### Components
- Functional components only. `StyleSheet.create` at bottom of file.
- `useCallback` for event handlers passed as props, `useMemo` for derived data.

### Async
- `void` prefix on floating Promises (e.g., `void SplashScreen.hideAsync()`).
- Async effects use isMounted/cancelled ref pattern.
- `InteractionManager.runAfterInteractions` for non-critical persistence writes.

### API Clients
- Separate `*-client.ts` per domain in `features/*/api/`.
- `EXPO_PUBLIC_API_BASE_URL` for base URL; platform defaults: `10.0.2.2` (Android emulator), `127.0.0.1` (iOS).
- Error envelope: `{ error: { code, message } }`. 15s timeout via `AbortController` on swap calls.

### Feature Flags (env vars)
- `EXPO_PUBLIC_API_BASE_URL` — backend URL
- `EXPO_PUBLIC_CHART_FALLBACK_POLL_MS` — chart polling interval (default 10000)
- `EXPO_PUBLIC_SWAP_SKR_MINT` — enables SKR as swap asset
- `EXPO_PUBLIC_ACTIVITY_DEV_MOCK` — shows seeded activity rows
- `EXPO_PUBLIC_FEED_INFINITE_SCROLL` — infinite vs single-page feed

### Naming
- Feature folders: `features/<domain>/`
- Design specs: `*-design-spec.ts`
- Hooks: `use-*.ts`
- Types: `types.ts` within feature folder
- Providers: `*-provider.tsx`

## Android Debugging

- `Feed unavailable` + `Network request failed` = backend is down/unreachable
- Native crash (missing view manager, `IllegalViewOperationException`) = native build mismatch, not backend
- Android emulator must use `http://10.0.2.2:3001` (not `localhost`)
- Clean native build: `cd android && ./gradlew clean && cd .. && npm run android`
