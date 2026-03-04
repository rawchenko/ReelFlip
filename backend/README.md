# ReelFlip Backend

Fastify API backend for feed and chart services.

## Supabase Migration Verification

Ensure backend is running and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are configured.

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
