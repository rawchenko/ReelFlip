# ReelFlip Backend

Fastify API backend for feed and chart services.

## Runtime Modes

- `RUNTIME_MODE=dev|prod` (`prod` auto-selected when `NODE_ENV=production`)
- `CACHE_REQUIRED=true|false` (defaults to `true` in `prod`)
- `ALLOW_DEGRADED_START=true|false` (default `false`)
- `REDIS_CONNECT_TIMEOUT_MS` (default `1500`)

When cache is required and Redis is unavailable, startup fails unless degraded start is explicitly allowed.

## Supabase Migration Verification

Ensure backend is running and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are configured.
Set `SUPABASE_READ_ENABLED=true` and optionally `SUPABASE_PREFER_READ_FIRST=true` to force Supabase-first reads before cache/provider fallback.

Commands:

```bash
npm run verify:parity
npm run perf:baseline
npm run perf:check
npm run rollout:gate
npm run verify:migration
```

Report artifacts are written to:

`supabase/verification/reports/`

Expected files:

- `parity_<timestamp>.json`
- `feed_p95_baseline.json`
- `feed_p95_<timestamp>.json`
- `rollout_gate_<timestamp>.json`

## Webhook Alerts

Optional migration alert webhook environment variables:

- `ALERT_WEBHOOK_URL`
- `ALERT_WEBHOOK_TIMEOUT_MS`
- `ALERT_WEBHOOK_RETRY_COUNT`
- `ALERT_WEBHOOK_COOLDOWN_SECONDS`
- `ALERT_FEED_SEED_RATE_THRESHOLD`
- `ALERT_SUPABASE_FAILURE_RATE_THRESHOLD`
- `ALERT_MIN_REQUESTS`

## Metrics Coverage

`GET /metrics` now includes:

- ingest success/failure counts and duration (`avgDurationMs`, `lastDurationMs`)
- ingest refresh and durable persistence outcome counters (`refreshSuccessCount`, `refreshFailureCount`, `durableSuccessCount`, `durableFailureCount`, `durableSkippedCount`)
- Supabase request latency/failure counters
- Supabase row writes by table (`rowsWrittenByTable`)
- feed fallback rates (`seedRate`, `staleRate`)
- cache source mix (`cache.feed.redisReads`, `memoryReads`, `repositoryReads`)
- upstream request health (`upstream.*`)
- chart stream publish/consume and lag/queue size (`stream.*`)
- rate-limit hit counter (`rateLimit.hits`)

Webhook alert payloads can include: `feed_seed_rate_high`, `supabase_failure_rate_high`, `ingest_failure_threshold`, `ingest_durable_failure_threshold`, and `ingest_missed_intervals`.
