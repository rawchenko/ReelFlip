# Supabase Verification

This folder contains migration verification checks and generated reports.

## Query Plan Checks

Run `performance_checks.sql` in the Supabase SQL editor after token data has been ingested.

Acceptance targets:
- `v_token_feed` top-N query returns quickly for feed pagination workloads.
- `token_candles_1m` query uses `idx_token_candles_1m_pair_time_sec_desc`.
- `feed_snapshot_items` query uses `idx_feed_snapshot_items_snapshot_id_position`.

## Stage 2 Schema Checks

Run `stage2_schema_checks.sql` in the Supabase SQL editor after applying Stage 2 migrations.

Checks include:
- required Stage 2 tables/columns and canonical keys
- required PK/FK/check constraints
- expected read indexes
- absence of deprecated legacy columns
- view-only read-surface enforcement for anon/authenticated:
  - no direct base-table `SELECT` grants
  - `SELECT` grant on `v_token_feed` only
  - permissive base-table public-read policies removed
- `v_token_feed` backward-compatible output shape

Run `stage2_timestamp_semantics_checks.sql` to verify that idempotent writes preserve `updated_at` while still advancing `ingested_at`.

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
