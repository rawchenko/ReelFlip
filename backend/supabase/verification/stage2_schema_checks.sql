-- Stage 2 schema verification checks.
-- Run in Supabase SQL editor after applying:
-- 20260306_stage2_token_domain_01_cutover.sql
-- 20260306_stage2_token_domain_02_constraints_indexes.sql
-- 20260306_stage2_token_domain_03_views_policies.sql
-- 20260306_stage2_token_domain_04_cleanup.sql
-- 20260306_stage2_token_domain_05_nullable_market_cap_backfill.sql
-- 20260306_stage2_token_domain_06_diff_aware_upserts.sql
-- 20260306_stage2_token_domain_06_read_surface_hardening.sql
-- 20260306_stage2_token_domain_07_candle_pair_fk.sql

-- 1) Required tables.
select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'tokens',
    'token_pairs',
    'token_market_latest',
    'token_labels_latest',
    'token_sparklines_latest',
    'token_candles_1m',
    'v_token_feed'
  )
order by table_name;

-- 2) Required columns by table.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'token_pairs' and column_name in ('pair_address', 'mint', 'dex', 'quote_symbol', 'pair_created_at_ms', 'updated_at', 'ingested_at', 'source_discovery')) or
    (table_name = 'token_market_latest' and column_name in ('mint', 'primary_pair_address', 'price_usd', 'price_change_24h', 'volume_24h', 'liquidity', 'market_cap', 'source_price', 'source_market_cap', 'source_liquidity', 'source_volume', 'source_metadata', 'updated_at', 'ingested_at')) or
    (table_name = 'token_labels_latest' and column_name in ('mint', 'category', 'risk_tier', 'trust_tags', 'discovery_labels', 'source_tags', 'source_labels', 'updated_at', 'ingested_at')) or
    (table_name = 'token_sparklines_latest' and column_name in ('mint', 'window', 'interval', 'points', 'source', 'history_quality', 'point_count_1m', 'last_point_time_sec', 'sparkline', 'generated_at', 'updated_at', 'ingested_at')) or
    (table_name = 'token_candles_1m' and column_name in ('pair_address', 'time_sec', 'open', 'high', 'low', 'close', 'volume', 'sample_count', 'source', 'updated_at', 'ingested_at'))
  )
order by table_name, column_name;

-- 3) Required constraints.
select conname, conrelid::regclass as table_name, contype
from pg_constraint
where conname in (
  'token_candles_1m_pkey',
  'token_candles_1m_pair_address_fkey',
  'token_market_latest_pkey',
  'token_labels_latest_pkey',
  'token_sparklines_latest_pkey',
  'token_pairs_pkey',
  'token_market_latest_primary_pair_address_fkey',
  'token_labels_latest_category_check',
  'token_labels_latest_risk_tier_check',
  'token_sparklines_latest_window_check',
  'token_sparklines_latest_interval_check'
)
order by conname;

-- 4) Required indexes.
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_token_market_latest_primary_pair_address',
    'idx_token_market_latest_updated_at_desc',
    'idx_token_market_latest_market_cap_desc',
    'idx_token_market_latest_volume_24h_desc',
    'idx_token_labels_latest_risk_tier_updated_at_desc',
    'idx_token_pairs_mint_updated_at_desc',
    'idx_token_candles_1m_pair_time_sec_desc',
    'idx_token_candles_1m_time_sec_desc'
  )
order by indexname;

-- 5) Required diff-aware upsert RPC functions.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'upsert_tokens_diff',
    'upsert_token_pairs_diff',
    'upsert_token_market_latest_diff',
    'upsert_token_labels_latest_diff',
    'upsert_token_sparklines_latest_diff'
  )
order by p.proname;

-- 6) Legacy columns should be absent post-cleanup.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'token_market_latest' and column_name in ('pair_address', 'pair_created_at_ms', 'quote_symbol', 'market_source_price', 'market_source_market_cap', 'metadata_source')) or
    (table_name = 'token_candles_1m' and column_name in ('bucket_start')) or
    (table_name = 'token_sparklines_latest' and column_name in ('candle_count_1m'))
  )
order by table_name, column_name;

-- 7) Security posture: no direct base-table SELECT grants for anon/authenticated.
-- Expected: 0 rows.
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'tokens',
    'token_pairs',
    'token_market_latest',
    'token_labels_latest',
    'token_sparklines_latest',
    'token_candles_1m',
    'feed_snapshots',
    'feed_snapshot_items'
  )
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'SELECT'
order by table_name, grantee;

-- 8) Security posture: client roles retain view-only SELECT.
-- Expected: 2 rows (anon + authenticated on v_token_feed).
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'v_token_feed'
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'SELECT'
order by table_name, grantee;

-- 9) Security posture: permissive base-table public-read policies removed.
-- Expected: 0 rows.
select
  schemaname,
  tablename,
  policyname
from pg_policies
where schemaname = 'public'
  and policyname in (
    'token_public_read',
    'token_pairs_public_read',
    'token_market_public_read',
    'token_labels_public_read',
    'token_sparklines_public_read',
    'token_candles_public_read'
  )
order by tablename, policyname;

-- 10) View security options.
-- Expected: reloptions contains security_invoker=false and security_barrier=true.
select
  c.relname as view_name,
  c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname = 'v_token_feed';

-- 11) View compatibility shape check.
select
  mint,
  "pairAddress",
  "pairCreatedAtMs",
  "quoteSymbol",
  "sparklineMeta",
  sources,
  category,
  "riskTier"
from public.v_token_feed
limit 5;
