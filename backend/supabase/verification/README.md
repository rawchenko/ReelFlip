# Supabase Verification

This folder contains migration verification checks and generated reports.

## Query Plan Checks

Run `performance_checks.sql` in the Supabase SQL editor after token data has been ingested.

Acceptance targets:
- `v_token_feed` top-N query returns quickly for feed pagination workloads.
- `token_candles_1m` query uses `idx_token_candles_1m_bucket_start_desc`.
- `feed_snapshot_items` query uses `idx_feed_snapshot_items_snapshot_id_position`.

## Automated Checks

From repo root:

```bash
npm run backend:verify:parity
npm run backend:perf:baseline
npm run backend:perf:check
npm run backend:rollout:gate
npm run backend:verify:migration
```

Artifacts are written to:

`backend/supabase/verification/reports/`

- `parity_<timestamp>.json`
- `feed_p95_baseline.json`
- `feed_p95_<timestamp>.json`
- `rollout_gate_<timestamp>.json`

Rollout policy details: `rollout_gates.md`.
