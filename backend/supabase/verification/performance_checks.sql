-- Run in Supabase SQL editor.

explain analyze
select *
from public.v_token_feed
order by "volume24h" desc
limit 20;

explain analyze
select *
from public.token_candles_1m
where pair_address = 'sample-pair-address'
order by time_sec desc
limit 360;

explain analyze
select fsi.position, fsi.mint
from public.feed_snapshot_items fsi
where fsi.snapshot_id = '00000000-0000-0000-0000-000000000000'
order by fsi.position asc;

select
  relname as index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
from pg_stat_user_indexes
where schemaname = 'public'
  and relname in (
    'idx_token_market_latest_primary_pair_address',
    'idx_token_market_latest_volume_24h_desc',
    'idx_token_labels_latest_risk_tier_updated_at_desc',
    'idx_token_candles_1m_pair_time_sec_desc',
    'idx_feed_snapshots_generated_at_desc',
    'idx_feed_snapshot_items_snapshot_id_position'
  )
order by relname;
