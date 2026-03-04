# Supabase Migration Rollout Gates (Strict 7-Day)

The fallback cleanup phase starts only after all checks below pass for 7 consecutive daily runs.

## Required Daily Checks

1. **Parity mismatch rate <= 2%**
- Source: `parity_*.json` reports from `verify:parity`
- Formula: `mismatchCount / checkedMints`

2. **`/v1/feed` p95 compare passes**
- Source: `feed_p95_*.json` reports from `perf:check`
- Pass rule: `current_p95_ms <= max(baseline_p95_ms * 1.20, baseline_p95_ms + 30)`

3. **Seed source rate <= 5%**
- Source: `ops_observations.json`
- Field: `seedSourceRate`

4. **No Supabase failure-rate alert bursts**
- Source: `ops_observations.json`
- Field: `supabaseFailureAlertCount` must be `0`

5. **No ingest missed-interval alerts**
- Source: `ops_observations.json`
- Field: `ingestMissedIntervalAlertCount` must be `0`

## Gate Evaluation

Run:

```bash
npm --prefix backend run rollout:gate
```

Output:
- `supabase/verification/reports/rollout_gate_<timestamp>.json`

Gate status is **fail-closed**: missing daily evidence counts as failure.

## Notes

- Keep read-through/write-through fallback behavior enabled until gate status is `pass`.
- Only remove deprecated in-memory-only branches after a full 7-day pass window.
