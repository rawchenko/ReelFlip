# Supabase Token Domain Field Ownership (Stage 1)

Date: March 5, 2026  
Status: Finalized for Stage 2 migration implementation

This document defines field-level ownership for the Stage 1 target schema.  
Owner values:
- `DexScreener`
- `Birdeye`
- `Helius`
- `Backend derived`
- `Ingest system`

## `tokens`

| Column | Writer / Owner | Update trigger / frequency | Fallback behavior | Nullability rationale |
|---|---|---|---|---|
| `mint` | Ingest system | On first token discovery; immutable key | Drop row if mint missing/invalid | Not null PK |
| `name` | Helius preferred; DexScreener fallback via backend merge | Updated during enrichment cycles | Keep last known non-empty value | Not null to protect client rendering |
| `symbol` | Helius preferred; DexScreener fallback via backend merge | Updated during enrichment cycles | Keep last known non-empty value | Not null to protect client rendering |
| `description` | Helius preferred; DexScreener fallback | On metadata refresh TTL or change detection | `null` when unavailable | Nullable because many tokens have no description |
| `image_uri` | Helius preferred; DexScreener fallback | On metadata refresh TTL or change detection | `null` when unavailable | Nullable because many tokens have no image |
| `first_seen_at` | Ingest system | Set once at first insert | Not backfilled if unknown | Not null for discovery auditability |
| `updated_at` | Ingest system | Bumped only when business metadata changes | Preserve previous value on identical writes | Not null freshness anchor |

## `token_pairs`

| Column | Writer / Owner | Update trigger / frequency | Fallback behavior | Nullability rationale |
|---|---|---|---|---|
| `pair_address` | DexScreener -> ingest normalization | On pair discovery and pair metadata refresh | Skip invalid/blank pair address | Not null PK |
| `mint` | DexScreener -> ingest normalization | On pair discovery | Skip pair when mint missing | Not null FK |
| `dex` | DexScreener | On pair discovery or provider correction | Use `unknown` only if source omits | Not null to support pair selection logic |
| `quote_symbol` | DexScreener | On pair metadata refresh | `null` when provider omits | Nullable for incomplete upstream data |
| `pair_created_at_ms` | DexScreener | On pair metadata refresh | `null` when unknown | Nullable because source may not provide |
| `updated_at` | Ingest system | Bumped when pair metadata changes | Preserve previous value on identical writes | Not null freshness anchor |
| `ingested_at` | Ingest system | Bumped on each successful write | `null` only for legacy backfilled rows | Nullable transitional operational field |
| `source_discovery` | Backend derived | Set when pair source path selected | `seed`/`unknown` when from fallback | Not null provenance |

## `token_market_latest`

| Column | Writer / Owner | Update trigger / frequency | Fallback behavior | Nullability rationale |
|---|---|---|---|---|
| `mint` | Ingest system | One row per mint upsert each cycle | Skip row when mint missing | Not null PK/FK |
| `primary_pair_address` | Backend derived | Set by pair selection logic each cycle | `null` when no eligible pair exists | Nullable because tokens may have no pair |
| `price_usd` | Birdeye preferred; DexScreener fallback via backend merge | Market enrichment cadence | Fall back to last known non-negative value or 0 by policy | Not null for feed calculations |
| `price_change_24h` | Birdeye preferred; DexScreener fallback | Market enrichment cadence | Fall back to last known value or 0 by policy | Not null for ranking consistency |
| `volume_24h` | Birdeye preferred; DexScreener fallback | Market enrichment cadence | Fall back to last known value or 0 by policy | Not null for ranking consistency |
| `liquidity` | Birdeye preferred; DexScreener fallback | Market enrichment cadence | Fall back to last known value or 0 by policy | Not null for eligibility checks |
| `market_cap` | Birdeye preferred; DexScreener fallback | Market enrichment cadence | `null` when both unavailable | Nullable because market cap can be absent |
| `recent_volume_5m` | Backend derived from chart/realtime | Ingest cycle where short-window stats are present | `null` if data unavailable | Nullable optional metric |
| `recent_txns_5m` | Backend derived from chart/realtime | Ingest cycle where short-window stats are present | `null` if data unavailable | Nullable optional metric |
| `source_price` | Backend derived | Set with `price_usd` selection | `seed` or previous source when fallback used | Not null provenance |
| `source_market_cap` | Backend derived | Set with `market_cap` selection | `unavailable` if no provider supplied value | Not null provenance |
| `source_liquidity` | Backend derived | Set with `liquidity` selection | Follow same source used for metric value | Not null provenance |
| `source_volume` | Backend derived | Set with `volume_24h` selection | Follow same source used for metric value | Not null provenance |
| `source_metadata` | Backend derived | Set when metadata owner chosen in merge | `seed` if only seeded values available | Not null compatibility field |
| `updated_at` | Ingest system | Bumped when market projection changes | Preserve previous value on identical writes | Not null freshness anchor |
| `ingested_at` | Ingest system | Bumped on each successful write | `null` only for legacy backfilled rows | Nullable transitional operational field |

## `token_labels_latest`

| Column | Writer / Owner | Update trigger / frequency | Fallback behavior | Nullability rationale |
|---|---|---|---|---|
| `mint` | Ingest system | One row per mint upsert each cycle | Skip row when mint missing | Not null PK/FK |
| `category` | Backend derived | Recomputed each ingest cycle | Default to conservative category rule | Not null enum for route filtering |
| `risk_tier` | Backend derived | Recomputed each ingest cycle | Default to `warn` when uncertain | Not null enum for safety policy |
| `trust_tags` | Backend derived + Helius/Jupiter signals | Recomputed each cycle | Empty array when none available | Not null array simplifies reads |
| `discovery_labels` | Backend derived | Recomputed each cycle | Empty array when none available | Not null array simplifies reads |
| `source_tags` | Backend derived | Recomputed each cycle | Empty array when no tag source available | Not null array for compatibility |
| `source_labels` | Backend derived | Recomputed each cycle | `derived` when provider not explicit | Not null provenance |
| `updated_at` | Ingest system | Bumped when labels/risk changes | Preserve previous value on identical writes | Not null freshness anchor |
| `ingested_at` | Ingest system | Bumped on each successful write | `null` only for legacy backfilled rows | Nullable transitional operational field |

## `token_sparklines_latest`

| Column | Writer / Owner | Update trigger / frequency | Fallback behavior | Nullability rationale |
|---|---|---|---|---|
| `mint` | Ingest system | Upsert when sparkline payload exists | Skip row if no sparkline payload | Not null PK/FK |
| `window` | Backend derived | Fixed by feed contract (`6h`) | Use contract default | Not null contract guard |
| `interval` | Backend derived from sparkline build | Per sparkline generation | Use `5m` contract default if bucketed | Not null enum |
| `points` | Backend derived | Computed on sparkline generation | 0 only when sparkline omitted | Not null shape metadata |
| `source` | Backend derived from chart provider | Per sparkline generation | `seed` or fallback source name | Not null provenance |
| `history_quality` | Backend derived from chart history service | Per sparkline generation | `null` when unavailable | Nullable optional quality signal |
| `point_count_1m` | Backend derived | Per sparkline generation | `null` when unavailable | Nullable optional metric |
| `last_point_time_sec` | Backend derived | Per sparkline generation | `null` when unavailable | Nullable optional metric |
| `sparkline` | Backend derived | Per sparkline generation | Omit row when empty and unavailable | Not null payload for populated rows |
| `generated_at` | Backend derived | Per sparkline generation | Use ingest cycle time when provider time absent | Not null payload timestamp |
| `updated_at` | Ingest system | Bumped when sparkline payload/meta changes | Preserve previous value on identical writes | Not null freshness anchor |
| `ingested_at` | Ingest system | Bumped on each successful write | `null` only for legacy backfilled rows | Nullable transitional operational field |

## `token_candles_1m`

| Column | Writer / Owner | Update trigger / frequency | Fallback behavior | Nullability rationale |
|---|---|---|---|---|
| `pair_address` | Ingest system from chart pipeline | Per candle write | Skip invalid/blank pair | Not null key FK |
| `time_sec` | Ingest system from chart pipeline | Per candle bucket | Skip invalid timestamp | Not null key |
| `open` | Chart provider normalized by backend | Per candle upsert | No fallback, skip malformed candle | Not null OHLCV |
| `high` | Chart provider normalized by backend | Per candle upsert | No fallback, skip malformed candle | Not null OHLCV |
| `low` | Chart provider normalized by backend | Per candle upsert | No fallback, skip malformed candle | Not null OHLCV |
| `close` | Chart provider normalized by backend | Per candle upsert | No fallback, skip malformed candle | Not null OHLCV |
| `volume` | Chart provider normalized by backend | Per candle upsert | Default 0 only if provider omits and row kept | Not null OHLCV |
| `sample_count` | Backend derived | Per candle upsert | Default 1 for single-sample buckets | Not null aggregation metadata |
| `source` | Backend derived from active chart provider | Per candle upsert | Fallback source label during degraded mode | Not null provenance |
| `updated_at` | Ingest system | Bumped when candle row values change | Preserve previous value on identical upsert | Not null freshness anchor |
| `ingested_at` | Ingest system | Bumped on each successful write | `null` only for legacy backfilled rows | Nullable transitional operational field |

## Ownership Notes
1. Provider precedence for market and metadata fields is resolved in backend merge logic.
2. Source columns must represent the owner used for each chosen value, not merely the last provider queried.
3. Nullability choices prioritize stable read contracts and resilience to upstream missing data.
