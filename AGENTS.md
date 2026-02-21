# ReelFlip - Agent Guide

> Solana Mobile app scaffold for the Monolith Hackathon. This guide must describe the current repository state only.

## Context Files

| File | Purpose | When to read |
|------|---------|-------------|
| `.agent/context.md` | Hackathon facts and current project status | Before planning priorities |
| `.agent/architecture.md` | Current provider tree, routing, data flow | Before modifying app structure/providers |
| `.agent/code-map.md` | Current map of source and supporting project files | When navigating unfamiliar files |
| `.agent/design.md` | Current UI patterns and styling rules in code | Before building or restyling UI |
| `constants/app-config.ts` | App identity and supported Solana clusters | When changing wallet/network settings |
| `constants/app-styles.ts` | Shared StyleSheet definitions used by screens/features | When extending app styles |
| `package.json` | Scripts and dependencies | Before running commands or changing packages |
| `app.json` | Expo app configuration and plugins | When changing build/runtime config |

## Current Implementation Snapshot

- Routes implemented: `app/_layout.tsx`, `app/index.tsx`
- Feature modules implemented: `features/account/*`, `features/network/*`
- Home screen currently renders app config info, account actions, and network RPC diagnostics.
- Reel-style token discovery/trading experience is not implemented yet.

## Commands

```bash
# Development
npm run dev                    # Expo dev server with cache reset + dev client
npm run start                  # Expo dev server
npm run web                    # Expo web dev server

# Native run/build
npm run android                # Run Android app via Expo
npm run ios                    # Run iOS app via Expo
npm run android:build          # Expo prebuild for Android
npm run build                  # Type-check + Android prebuild

# Verification builds
npm run verify:android:debug   # Prebuild + Gradle debug assemble
npm run verify:android:release # Prebuild + Gradle release assemble
npm run verify:local           # Type-check + lint + format check + debug assemble

# Quality
npm run lint                   # Expo lint with auto-fix
npm run lint:check             # Expo lint (check only)
npm run fmt                    # Prettier write
npm run fmt:check              # Prettier check
npm run ci                     # Type-check + lint check + format check + Android prebuild

# Diagnostics
npm run doctor                 # expo-doctor

# Install hook
npm run postinstall            # Apply patch-package patches after install
```

## Project Structure (Current)

```text
ReelFlip/
|- .agent/                     # Agent context docs for this repo
|- app/                        # Expo Router screens
|  |- _layout.tsx              # Root layout with providers + Stack
|  |- index.tsx                # Home screen
|- assets/images/              # App icons/splash/favicon assets
|- components/
|  |- app-providers.tsx        # QueryClient + Network + MobileWallet providers
|- constants/
|  |- app-config.ts            # Identity + Solana cluster definitions
|  |- app-styles.ts            # Shared StyleSheet used in app/features
|- docs/                       # Local development/build notes
|- features/
|  |- account/                 # Connect/disconnect/balance/sign actions
|  |- network/                 # Cluster selection + RPC diagnostics
|- patches/                    # patch-package overrides for dependencies
|- plugins/
|  |- with-node-binary-gradle.js # Expo config plugin for Gradle/node handling
|- utils/
|  |- ellipsify.ts
|  |- lamports-to-sol.ts
|- expo-env.d.ts               # Expo TypeScript env declarations
|- index.js                    # Entry: polyfill + expo-router/entry
|- polyfill.js                 # react-native-quick-crypto install
|- app.json                    # Expo config
|- package.json                # Scripts + dependencies
|- tsconfig.json               # TypeScript config
```

## Code Style

- Language: TypeScript (strict) with React Native/Expo
- Formatting: Prettier (`.prettierrc`)
- Linting: ESLint via `eslint-config-expo`
- Imports: Prefer `@/` alias for project-root imports
- Components: Functional components with named exports
- Default exports: Only Expo Router screen components in `app/`
- Styling: Shared `StyleSheet.create` objects (`constants/app-styles.ts`) for reusable UI patterns

## Documentation Rule

When updating these docs, record only what exists in the repository now. Do not document planned architecture as if implemented.
