# ReelFlip Architecture Clarifications and Next Steps

Last updated: March 4, 2026

This document extends the current-state architecture doc with scaling analysis and a concrete production/trading implementation plan.

## 1) Performance and Bottlenecks

### 1.1 Current bottlenecks in code

1. Chart ingestion uses per-pair REST polling from DexScreener every second.
- `ChartRegistry` polls active pairs on `CHART_INTERVAL_MS=1000` (`backend/src/chart/chart.registry.ts`).
- `DexScreenerChartProvider.fetchPairSnapshots()` performs one HTTP request per pair (`backend/src/chart/chart.provider.dexscreener.ts`).
- With default `CHART_MAX_ACTIVE_PAIRS_GLOBAL=256`, one backend instance can generate up to ~256 external requests/sec just for chart ticks.

2. Chart fanout uses Redis Streams with one blocking reader loop per client connection.
- WS/SSE handlers perform repeated `chartStreamService.read()` per client (`backend/src/chart/chart.transport.ws.ts`, `backend/src/chart/chart.route.ts`).
- This pattern scales poorly at high concurrent websocket counts.

3. Feed refresh path can become upstream-heavy.
- Snapshot refresh is periodic (`FeedSnapshotRefresher`, `TOKEN_INGEST_INTERVAL_SECONDS`) and enrichment can call Birdeye + Helius + Jupiter tags across many items (`backend/src/feed/feed.enrichment.ts`).
- If running without Redis, each instance may refresh independently (no shared distributed lock), increasing upstream pressure.

4. External dependency concentration.
- Feed discovery and chart snapshots are both DexScreener-dependent in current runtime.

### 1.2 What breaks first at 10k-100k users

1. Realtime chart subsystem before feed API.
- Unique active pair cap per backend instance (`maxActivePairsGlobal=256`) is the first hard limit.
- If users spread across many pairs, stale/reconnecting status will increase quickly.

2. External provider limits before CPU limits.
- DexScreener and enrichment APIs become the first failure domain under load spikes.

3. Redis connection/read pressure from per-client stream loops.
- Connection count and XREAD patterns become expensive before pure application CPU does.

### 1.3 Recommended scaling strategy

#### Feed generation

1. Separate API serving from snapshot generation.
- Run dedicated feed worker(s) that generate snapshots and publish immutable snapshot IDs.
- API nodes only read already-built snapshots.

2. Introduce multi-level caching.
- L1 in-process cache for hottest snapshot.
- L2 Redis snapshot cache.
- Optional edge cache for first page(s) if feed is mostly global.

3. Add provider budget controls.
- Global token bucket per provider + per-route quotas.
- Serve stale snapshot when provider budget exhausted.

4. Persist and replay snapshots.
- Keep N recent snapshots in Redis/Supabase for rollback and incident recovery.

#### Chart streaming

1. Replace per-pair REST polling with streaming ingestion.
- Use Yellowstone/LaserStream-style gRPC ingestion once, then aggregate once, fan out many.

2. Split into dedicated realtime services.
- `chart-ingest` service: consumes market stream and updates pair state.
- `chart-gateway` service: websocket fanout to clients.

3. Move from per-connection Redis XREAD loops to server-side pub/sub fanout.
- One subscription per pair per gateway process, many websocket subscribers in memory.

4. Shard by pair hash.
- Consistent-hash pairs to ingest shards so each pair is computed exactly once.

#### Redis streams

1. Keep streams for durability/replay only, not direct per-client reads.
2. Enforce maxlen and retention policy per stream.
3. Partition by shard key and interval to avoid hot keys.
4. Add consumer lag alerts and backpressure thresholds.

#### External API limits

1. Multi-provider fallback for each capability.
- Discovery: own indexer + Dex fallback.
- Market data: primary + secondary provider.

2. Circuit breaker + stale-while-revalidate as default behavior.
3. Explicit fail-open rules in feed path and fail-safe rules in trade path.

---

## 2) Token Discovery Latency

### 2.1 Current time-to-appearance

Current path = provider indexing delay + feed refresh cycle + cache visibility.

- Feed refresh interval defaults to 5s (`FEED_REFRESH_INTERVAL_SECONDS`).
- Cache fresh/stale windows default to 5s/30s (`FEED_CACHE_TTL_SECONDS`, `FEED_CACHE_STALE_TTL_SECONDS`).
- Real limiting factor is DexScreener pair visibility delay and discovery coverage.

Practical expectation today:
- Best case: ~10-20s after provider lists pair.
- Common case: ~30-120s.
- Worst case: several minutes if provider indexing/discovery endpoint lags.

### 2.2 What limits speed today

1. Reliance on DexScreener discovery/listing latency.
2. Discovery strategy depends on endpoint/search coverage.
3. Snapshot refresh cadence (5s) adds bounded but non-zero delay.
4. Upstream failures cause seed/stale fallback.

### 2.3 How to detect faster than DexScreener

1. Build direct on-chain pair indexer.
- Subscribe to pool-creation and liquidity-add instructions for target DEX programs (Raydium/Orca/Meteora/Pump migration paths).

2. Use Yellowstone/LaserStream/WebSocket RPC streams.
- Detect pair creation from program logs/accounts in near realtime.

3. Maintain internal pair registry.
- Track `first_seen_onchain`, `first_liquidity_onchain`, `first_seen_provider`.
- Serve newly detected pairs immediately with “provisional liquidity” flag until verified.

4. Add safety gate before feed exposure.
- Require minimum liquidity floor and age (e.g. 30-120s) to reduce fake/flash liquidity spam.

---

## 3) RPC Strategy Proposal

Current system has no backend Solana trade RPC path; this is required for `/v1/trades/*`.

### 3.1 Recommended provider mix

1. Primary: Helius staked RPC + Sender path.
2. Secondary: Triton shared/dedicated RPC for read/write failover.
3. Optional tertiary burst fallback: Ankr pay-as-you-go endpoint.

Reasoning:
- Helius provides high sendTransaction throughput and explicit Solana-focused infra.
- Triton has transparent Solana pricing and strong streaming stack.
- Ankr provides low-friction overflow capacity pricing.

### 3.2 Failover design

1. Separate read and write pools.
- Read pool for simulation, account lookups, confirmation checks.
- Write pool for sendTransaction/broadcast.

2. Health-scored endpoint routing.
- Score endpoints on p95 latency, error rate, slot lag, confirmation delay.
- Eject endpoints on threshold breach; probe for recovery.

3. Parallel broadcast on submit.
- Send signed transaction concurrently to 2 providers + optional Jito path.
- First accepted signature wins; dedupe downstream by signature.

4. Confirmation quorum.
- Confirm status across at least 2 independent RPC sources before finalizing failure where feasible.

### 3.3 Expected monthly cost (initial planning range)

Assumptions:
- 250k swaps/day (7.5M/month).
- ~10-20 RPC requests per swap lifecycle (simulation, send, confirmation polling/subscriptions).

Expected ranges:
1. Helius plan cost: ~$499-$999/month base (Business/Professional), then overage credits as needed.
2. Secondary provider (Triton shared): starts at ~$125/month + per-call and bandwidth usage.
3. Jito/Sender tip budget (if used aggressively): can become a dominant cost line during congestion.

Recommendation:
- Budget initial RPC+broadcast stack at $2k-$8k/month for launch scale with headroom.
- Recalculate monthly from observed request-per-swap and confirmation strategy after beta.

---

## 4) Trading System Design

### 4.1 Proposed service components

1. `QuoteService`
- Calls Jupiter `/swap/v1/quote`.
- Applies route policy filters and risk checks.
- Stores quote with TTL (e.g. 15-30s) in Redis.

2. `TradeBuildService`
- Validates quote and user intent.
- Calls Jupiter `/swap/v1/swap-instructions` (or `/swap` for unsigned tx base64).
- Builds unsigned versioned transaction and returns `tradeIntentId`.

3. `TradeSubmitService`
- Validates signed transaction matches built intent (message hash / account invariants).
- Simulates transaction on RPC.
- Broadcasts through multi-RPC + optional Jito path.
- Persists status transitions.

4. `TradeStatusService`
- Returns state machine status from DB + live confirmation checks.
- Optional websocket push channel for low-latency updates.

### 4.2 Endpoint contracts (proposed)

1. `POST /v1/quotes`
- Input: wallet, inputMint, outputMint, amount, slippageBps.
- Output: quoteId, expiresAt, expected amounts, price impact, warnings.

2. `POST /v1/trades/build`
- Input: quoteId, wallet, optional fee priority config.
- Output: tradeIntentId, unsignedTxBase64, expiresAt.

3. `POST /v1/trades/submit`
- Input: tradeIntentId, signedTxBase64, idempotencyKey.
- Output: tradeId, signature, status=`submitted`.

4. `GET /v1/trades/status?tradeId=...`
- Output: status + reason + signature + slot/confirmation metadata.

### 4.3 Wallet signing flow

1. App requests quote.
2. App requests build.
3. Backend returns unsigned tx.
4. App signs tx with Mobile Wallet Adapter.
5. App submits signed tx.
6. App polls/streams status until `confirmed` or `failed`.

### 4.4 Error handling model

Canonical errors:
1. `QUOTE_EXPIRED`
2. `ROUTE_UNAVAILABLE`
3. `RISK_BLOCKED`
4. `SIMULATION_FAILED`
5. `BROADCAST_FAILED`
6. `SLIPPAGE_EXCEEDED`
7. `RATE_LIMITED`

Safety controls:
1. Build/submit idempotency keys.
2. Strict quote TTL and replay protection.
3. Signature and account invariant checks before broadcast.
4. Persist full lifecycle for audit and retries.

---

## 5) Production Infrastructure Plan

### 5.1 Cloud and runtime

Recommended: AWS.

1. API and gateway services on ECS Fargate for initial production.
2. Dedicated chart-ingest and chart-gateway services separated from feed API.
3. Move chart-gateway to ECS on EC2 or EKS when websocket concurrency grows beyond cost/perf comfort on Fargate.

### 5.2 Containerization and load balancing

1. One container image per service (`feed-api`, `trade-api`, `chart-ingest`, `chart-gateway`, `workers`).
2. ALB in front of HTTP + websocket services.
3. Path-based routing and optional sticky sessions for websocket gateway.

### 5.3 Data and messaging

1. ElastiCache Redis (cluster mode enabled) for cache, locks, ephemeral eventing.
2. Supabase Postgres initially; migrate to managed Postgres with read replica if needed.
3. Optional Kafka/MSK when event durability/analytics throughput exceeds Redis stream comfort.

### 5.4 Autoscaling

1. Feed/trade API autoscale on CPU + request latency + 5xx rates.
2. Chart-gateway autoscale on active websocket connections + outbound messages/sec.
3. Worker autoscale on queue lag and job runtime.

### 5.5 Monitoring, alerts, logging

1. OpenTelemetry tracing across all services.
2. Prometheus metrics + Grafana dashboards.
3. CloudWatch log aggregation with JSON structured logs.
4. Pager alerts on:
- trade failure rate
- broadcast latency
- provider circuit-open rate
- chart lag and dropped events
- Redis memory/latency

---

## 6) Security Plan

### 6.1 API abuse and rate-limit attacks

1. WAF + bot management at edge.
2. Multi-dimensional rate limits (IP, wallet, device fingerprint, auth token).
3. Endpoint-specific quotas (`/quotes`, `/trades/submit`, `/chart/ws`).
4. Abuse scoring and temporary bans.

### 6.2 Malicious tokens and fake liquidity

1. Token risk engine checks before feed inclusion and before quote acceptance.
2. Liquidity quality checks: minimum depth, LP concentration, pool age, holder concentration.
3. “Provisional/new pair” state with stricter trade limits and warnings.
4. Honeypot-style simulation checks when possible.

### 6.3 Transaction security

1. SIWS auth for privileged endpoints.
2. Strict verification that submitted signed tx matches server-built intent.
3. Replay protection and short-lived intents.
4. Full immutable audit trail of trade lifecycle decisions.

---

## 7) Development Roadmap

### Milestone 1: Trading functionality (3-5 weeks)

1. Implement `/v1/quotes`, `/v1/trades/build`, `/v1/trades/submit`, `/v1/trades/status`.
2. Integrate Jupiter quote + swap-instructions.
3. Add trade status state machine + persistence + idempotency.
4. Replace feed trade placeholder UI with real signing flow.

Exit criteria:
- >=95% successful submission for healthy routes.
- Clear failure reasons and retry UX.

### Milestone 2: Faster token discovery (3-4 weeks)

1. Build direct on-chain pair detector for target Solana DEX programs.
2. Add pair registry and exposure policy.
3. Keep DexScreener as fallback/enrichment source.

Exit criteria:
- p50 new pair detection under 5s after on-chain creation.
- p95 under 20s for supported programs.

### Milestone 3: Production infra hardening (4-6 weeks)

1. Split monolith into feed/trade/chart roles.
2. Deploy autoscaling services + observability stack.
3. Add DR runbooks, canary deploys, and SLO dashboards.

Exit criteria:
- 99.9% API availability SLO.
- Controlled failover drills pass.

### Milestone 4: Advanced analytics and intelligence (4-6 weeks)

1. Whale trade detection pipeline.
2. Alert engine (price/liquidity/trade anomalies).
3. User-facing alert channels and internal moderation dashboards.

Exit criteria:
- Event pipeline supports near-realtime analytics without impacting trade/feed latency.

---

## Decision Summary

If the goal is to ship trading quickly and scale to 10k-100k users reliably:

1. Implement trade endpoints first with strict intent validation and multi-RPC broadcast.
2. Decouple chart ingestion from REST polling by moving to stream-based market data.
3. Treat Redis as shared state/event substrate, not per-client stream reader.
4. Add direct on-chain token discovery to reduce dependence on third-party listing delays.
5. Stand up production-grade observability and abuse controls before broad traffic rollout.

---

## External References

1. Helius pricing and limits: https://www.helius.dev/pricing
2. Jupiter Metis quote API: https://dev.jup.ag/docs/api/swap-api/quote
3. Jupiter swap-instructions API: https://dev.jup.ag/docs/api/swap-api/swap-instructions
4. AWS Fargate pricing: https://aws.amazon.com/fargate/pricing/
5. Triton Solana pricing summary: https://www.triton.one/solana
6. Ankr Solana RPC pricing: https://www.ankr.com/docs/rpc-service/pricing/
7. QuickNode Solana Yellowstone gRPC (shared node starts at $499/mo): https://www.quicknode.com/solana-yellowstone-grpc

