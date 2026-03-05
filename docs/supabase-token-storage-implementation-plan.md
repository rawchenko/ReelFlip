# Supabase Token Storage Implementation Plan (6 Stages)

## Goal
Move token data ownership fully to backend + Supabase so the app reads only backend APIs, with reliable freshness, cache-backed performance, and safe rollout.

## Scope
- In scope:
  - Supabase schema and migrations for token domain.
  - Backend ingest, normalization, dedupe, upsert, read APIs, cache integration.
  - Historical backfill, parity checks, observability, staged rollout.
- Out of scope:
  - Direct provider calls from mobile app.
  - Client-side persistence logic for source-of-truth token data.

## Stage 1: Data Model Finalization
### Objective
Define a normalized schema that separates static token metadata from volatile market and chart data.

### Status (March 5, 2026)
- `Completed (design contract finalized; no migration/code changes in this stage).`
- Artifacts:
  - [docs/supabase-token-domain-stage1-contract.md](/Users/rawchenko/Documents/GitHub/ReelFlip/docs/supabase-token-domain-stage1-contract.md)
  - [docs/supabase-token-domain-field-ownership.md](/Users/rawchenko/Documents/GitHub/ReelFlip/docs/supabase-token-domain-field-ownership.md)

### Work
- Finalize tables:
  - `tokens` (mint PK, name, symbol, description, image_uri, updated_at).
  - `token_market_latest` (mint PK/FK, price, market_cap, liquidity, volume, changes, pair refs, updated_at).
  - `token_labels_latest` (mint PK/FK, category, risk_tier, labels/tags, updated_at).
  - `token_pairs` (pair_address PK, mint FK, dex, quote_symbol, pair_created_at_ms, updated_at).
  - `token_candles_1m` (pair_address + time_sec unique, OHLCV + source + updated_at).
  - `token_sparklines_latest` (mint PK/FK, window/interval/points/source/history_quality, sparkline array/json, generated_at).
- Define source/freshness fields (`source_*`, `updated_at`, optional `ingested_at`).
- Define retention policy for high-volume tables (candles).

### Deliverables
- ERD + table contracts in docs.
- Field-level ownership map (which provider writes which fields).

### Exit Criteria
- Schema supports one token with multiple pairs.
- No chart blobs stored in core token metadata rows.
- Team sign-off on schema and naming.

### Stage 2 Handoff Notes
- Contract freezes canonical table names, key shapes, and conflict targets.
- Backward-compatible feed mapping is defined so `v_token_feed` can keep existing client shape.
- Unresolved schema decisions list is empty; Stage 2 should focus on migrations/constraints only.

## Stage 2: Migrations and Constraints
### Objective
Create robust SQL migrations and constraints that guarantee consistency and idempotent upserts.

### Work
- Add/adjust SQL migrations under `backend/supabase/migrations/`.
- Add constraints:
  - PK/FK, not-null, check constraints for enums.
  - Unique indexes for upsert conflict targets.
  - Read indexes for feed (`updated_at`, `market_cap`, `volume_24h`, `risk_tier`, etc.).
- Add views for API-read shape (for example, `v_token_feed`), keeping backward-compatible fields where possible.

### Deliverables
- Migration scripts (forward-only).
- Verification SQL and rollback playbook (operational rollback, not schema down migration).

### Exit Criteria
- Fresh database can bootstrap with one migration run.
- Existing environments migrate with zero data loss.
- Upsert conflict targets are explicit and tested.

## Stage 3: Backend Ingest Pipeline
### Objective
Ingest token universe server-side, normalize provider payloads, and persist in Supabase continuously.

### Work
- Implement/extend scheduled ingest jobs:
  - Discovery jobs (new tokens/pairs).
  - Enrichment jobs (metadata, labels, market, sparkline).
  - Candle ingest/write-through for 1m history.
- Add normalization and canonicalization:
  - Normalize mint/pair casing and empty values.
  - Dedupe by mint and select best market pair for `*_latest` projections.
- Implement batch upserts with bounded concurrency and retry/backoff.
- Add dead-letter/retry strategy for provider or Supabase transient failures.

### Deliverables
- Production-safe ingest workers with config flags.
- Batch write metrics and failure counters.

### Exit Criteria
- Ingest runs without app involvement.
- New tokens appear in Supabase within target SLA.
- Retry strategy prevents silent drops.

## Stage 4: Read Path and Cache Integration
### Objective
Serve app traffic from backend read APIs backed by cache-first strategy and Supabase durability.

### Work
- Keep/extend read flow:
  - Cache (Redis or memory fallback) -> Supabase read-through -> provider fallback (if allowed).
- Ensure endpoints expose cache/freshness metadata (`X-Cache`, `generatedAt`, staleness flags).
- Add strict server-side freshness guardrails:
  - Maximum acceptable age per route.
  - Degraded response behavior when stale.
- Ensure app remains backend-only consumer (no provider keys or direct provider requests in app).

### Deliverables
- Updated API contracts with freshness semantics.
- Cache TTL matrix by route/data type.

### Exit Criteria
- P95 read latency stays within target.
- Feed/chart continue working when provider is transiently degraded.
- Client has no dependency on provider endpoints.

## Stage 5: Backfill and Parity Validation
### Objective
Backfill missing history and prove Supabase outputs match expected provider-backed outputs.

### Work
- Run one-time and resumable backfill jobs:
  - Token metadata and market snapshots.
  - Candle history for selected horizon.
- Run parity checks (backend response vs Supabase-backed response) on sampled and top tokens.
- Define mismatch thresholds and auto-fail gates for rollout.

### Deliverables
- Backfill runbooks and checkpointing.
- Parity reports under `backend/supabase/verification/reports/`.

### Exit Criteria
- Backfill completeness target reached (for defined token set).
- Parity pass rate meets gate thresholds.
- No critical data drift before rollout.

## Stage 6: Gradual Rollout and Operations
### Objective
Roll out safely with feature flags, monitoring, and rollback controls.

### Work
- Rollout phases:
  - Phase A: dual-write + shadow-read metrics.
  - Phase B: partial read-through traffic.
  - Phase C: Supabase-preferred reads.
  - Phase D: full Supabase-backed read path.
- Track SLOs:
  - API latency/error rates.
  - Supabase failure rate and retry rate.
  - Data freshness lag.
  - Cache hit/miss/stale ratios.
- Define rollback triggers and one-command rollback procedure (toggle flags).

### Deliverables
- Rollout checklist and on-call playbook.
- Alert thresholds and dashboards.

### Exit Criteria
- Stable production metrics for defined soak period.
- Rollback not required for one full cycle.
- Supabase-backed mode becomes default.

## Cross-Stage Controls
- Security:
  - Service role key remains backend-only.
  - RLS policies for non-service clients on read-facing views only.
  - Stage 2 hardening migration enforces view-only client access (`v_token_feed`) by revoking base-table client grants/policies.
- Performance:
  - Batch writes, bounded concurrency, index reviews after backfill.
- Data quality:
  - Required fields, nullability rules, enum constraints, and periodic audits.
- Operability:
  - Every stage has a smoke test, metrics checks, and explicit go/no-go gate.

## Suggested Execution Order and Milestones
1. Stage 1 and Stage 2 (schema contract + migrations).
2. Stage 3 baseline ingest with guarded flags.
3. Stage 4 read-path hardening and cache tuning.
4. Stage 5 backfill and parity sign-off.
5. Stage 6 phased rollout to default-on.

## Definition of Done
- Backend is sole source for app token data access.
- Supabase is durable store for token domain and chart history.
- Cache provides low-latency reads; Supabase ensures persistence.
- Monitoring, alerts, and rollback controls are validated in production.
