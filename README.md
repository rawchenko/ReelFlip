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

## Fast Daily Dev Workflow

One-time setup:

```bash
npm install
npm --prefix backend install
cp .env.example .env
cp backend/.env.example backend/.env
```

Daily loop:

```bash
npm run dev:up
npm run android
```

Useful helpers:

```bash
npm run dev:check
npm run dev:logs
npm run dev:down
```

Notes:

- `dev:up` is the long-running main terminal: it starts backend first, waits for `http://127.0.0.1:3001/health`, then starts Metro.
- Open a second terminal for `npm run android`.
- Press `Ctrl+C` in the `dev:up` terminal to stop Metro and the backend it started.
- Android emulator should use `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001` in `.env`.

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

### Supabase Token Persistence

Backend supports Supabase-backed token/feed/chart persistence in hybrid mode.

1. Set these variables in `backend/.env`:
```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_READ_ENABLED=true
SUPABASE_PREFER_READ_FIRST=true
SUPABASE_DUAL_WRITE_ENABLED=true
TOKEN_INGEST_INTERVAL_SECONDS=300
TOKEN_CANDLE_RETENTION_DAYS=14
```
2. Keep mobile API contract unchanged (`GET /v1/feed` stays the same).
3. Backend will dual-write token domain data to Supabase and optionally read-through from Supabase first.
4. Monitoring endpoints:
- `GET /health` includes migration flags and in-process counters.
- `GET /metrics` returns feed/supabase/ingest counters for dashboards or log shipping.
5. Performance verification SQL:
- `backend/supabase/verification/performance_checks.sql`
6. Migration closure verification commands:
- `npm run backend:verify:parity`
- `npm run backend:perf:baseline`
- `npm run backend:perf:check`
- `npm run backend:rollout:gate`
- `npm run backend:verify:migration`
7. Generated reports:
- `backend/supabase/verification/reports/*.json`
8. CI workflow:
- `.github/workflows/backend-migration-verification.yml` runs build/tests on backend changes and, when Supabase secrets are configured, executes parity + perf verification and uploads reports.
### Build Android

```bash
npm run android:build
npm run android
```

## Documentation

- [MVP Spec](docs/mvp.md) — product vision, screens, data contracts, acceptance criteria
- [Architecture](docs/architecture.md) — system design, services, data flow, deployment
- [API Contract](docs/api-contract.md) — all endpoints (implemented + planned)
- [Data Schema](docs/data-schema.md) — Supabase tables, views, indexes, field ownership

## Links

- Website: [reelflip.app](https://reelflip.app)
