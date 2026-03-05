# Gecko -> Birdeye Rollout Checklist (Points Contract)

Last updated: 2026-03-05

## 1) Preflight (executed now)

- [x] Backend unit/integration tests pass.
  - Command: `npm --prefix backend run test`
  - Result: `109 passed, 0 failed`.

- [x] App TypeScript check passes.
  - Command: `npx tsc --noEmit`
  - Result: pass.

- [x] App lint check runs.
  - Command: `npm run lint:check`
  - Result: pass.

- [x] New DB migration exists for sparkline point metadata.
  - File: `backend/supabase/migrations/20260305_chart_points_meta.sql`

- [ ] Full migration verification script is blocked in this shell without Supabase credentials.
  - Command: `npm run backend:verify:migration`
  - Blocker: missing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

- [x] Runtime health/metrics endpoint reachable locally.
  - Commands:
    - `curl -sS http://127.0.0.1:3001/health`
    - `curl -sS http://127.0.0.1:3001/metrics`
  - Observed now: `feed.seedRate=1`, `feed.sourceProviders=0`, upstream dominated by `dexscreener_feed` failures/circuit-open on the currently running local backend.

## 2) Deploy order

- [ ] Apply DB migration first:
  - `backend/supabase/migrations/20260305_chart_points_meta.sql`

- [ ] Deploy backend build containing:
  - Birdeye historical provider + fallback provider chain.
  - `/v1/chart` + batch + stream/ws points-only contract.
  - Feed freshness/coverage eligibility (`pointCount1m`, `lastPointTimeSec`, `chart_stale`).

- [ ] Deploy frontend build consuming points-only chart transport.

## 3) Environment flag rollout

- [ ] Phase A (safe default deploy):
  - `CHART_HISTORY_PROVIDER=public`
  - `CHART_HISTORY_PROVIDER_FALLBACK=none`

- [ ] Phase B (staging flip):
  - `CHART_HISTORY_PROVIDER=birdeye`
  - `CHART_HISTORY_PROVIDER_FALLBACK=public`
  - Ensure `BIRDEYE_API_KEY` is set.

- [ ] Phase C (canary production):
  - Same as Phase B for canary slice.

- [ ] Phase D (full production):
  - Same as Phase B globally.

## 4) API smoke checks after each phase

- [ ] Feed response includes point metadata (no `candleCount1m`):
  - `curl -sS 'http://<host>/v1/feed?category=trending&limit=20'`
  - Verify `sparklineMeta.pointCount1m` and `sparklineMeta.lastPointTimeSec`.

- [ ] Chart history endpoint returns `points` and not `candles`:
  - `curl -sS 'http://<host>/v1/chart/<pairAddress>?interval=1m&limit=60'`
  - Verify payload has `points: [{time,value}]`.

- [ ] Batch history endpoint returns `points` per result:
  - `curl -sS -X POST 'http://<host>/v1/chart/batch' -H 'content-type: application/json' -d '{"pairAddresses":["<pair>"],"interval":"1m","limit":60}'`

- [ ] Realtime stream emits `point_update`:
  - WS/SSE snapshot contains `points`.
  - Incremental events use `type: "point_update"`.

## 5) Canary monitoring checks

- [ ] Upstream Birdeye health (via `/metrics`):
  - `upstream.birdeye_history.totalRequests`
  - `upstream.birdeye_history.failedRequests`
  - `upstream.birdeye_history.circuitOpen`

- [ ] Fallback activation:
  - Search logs for message: `"Historical provider fallback used"`.
  - Alert if fallback rate stays high after warm-up.

- [ ] Chart availability quality:
  - Track route log counters:
    - `feed_filtered_ineligible_insufficient_chart_history`
    - `feed_filtered_ineligible_chart_stale`
  - Compare against pre-rollout baseline.

- [ ] Seed source regression:
  - Track `/metrics.feed.seedRate`.
  - Ensure canary does not drift into seed-dominated feed.

## 6) Rollback criteria

- [ ] Immediate rollback if any of:
  - sustained Birdeye circuit-open with elevated chart ineligible counts,
  - feed availability regression,
  - severe latency/error increase on chart/feed endpoints.

- [ ] Rollback flags:
  - `CHART_HISTORY_PROVIDER=public`
  - `CHART_HISTORY_PROVIDER_FALLBACK=none`

## 7) Post-stability cleanup

- [ ] After stability window, remove Gecko/public fallback path if desired.
- [ ] Remove dead candle transport compatibility code paths (internal candle storage can remain if still needed).
