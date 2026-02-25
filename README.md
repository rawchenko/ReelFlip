# ReelFlip

TikTok-style crypto trading app built on Solana.

## Tech Stack

- **Expo 54** + React Native 0.81
- **@solana/kit** v5 + **@wallet-ui/react-native-kit** v3
- **Mobile Wallet Adapter** for wallet connections
- **expo-router** for navigation
- **@tanstack/react-query** for data fetching

## Getting Started

```bash
npm install
npm run dev
```

### Feed Backend (Phase 1)

The mobile feed now calls `GET /v1/feed` from a local Fastify backend.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
npm --prefix backend install
npm run backend:dev
```

In a second terminal:

```bash
npm run dev
```

Set `EXPO_PUBLIC_API_BASE_URL` in `.env` when running on a real device or custom simulator networking.

### Build Android

```bash
npm run android:build
npm run android
```

## Links

- Website: [reelflip.app](https://reelflip.app)
