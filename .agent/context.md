# ReelFlip - Project Context (Current State)

## Hackathon

- Event: Monolith (Solana Mobile Hackathon #2)
- Organizers: Solana Mobile and Radiants
- Dates: February 2, 2026 to March 9, 2026
- Submission deadline: March 9, 2026
- Results window: early April 2026

## Submission Requirements

Required deliverables:

1. Functional Android APK
2. Public GitHub repository with source code
3. Demo video
4. Pitch deck or short presentation

## Judging Criteria

Weighted evenly:

1. Stickiness and product-market fit
2. User experience quality
3. Innovation / x-factor
4. Presentation and demo clarity

## Current Project Status

ReelFlip currently implements foundational Solana Mobile app capabilities:

- Expo Router app shell with one home route
- Wallet connection and account actions through Mobile Wallet Adapter
- Solana cluster selection (devnet/testnet) and RPC diagnostics
- Basic shared styles and configuration scaffolding

Current code is a platform foundation, not a full trading experience.

## Tech Stack In Use

- Expo SDK 54 + React Native 0.81
- expo-router
- `@wallet-ui/react-native-kit` (MWA)
- `@solana/kit`
- `@tanstack/react-query`
- `react-native-quick-crypto`

## Constraints For Planning Work

- Prioritize current, working Android/mobile behavior
- Keep docs aligned with implemented files and scripts
- Do not describe unimplemented features as available
