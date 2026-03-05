-- Stage 2 timestamp semantics verification.
-- Expected: all boolean assertion columns below evaluate to true.

create temporary table _ts_semantics_ctx as
select
  'ts-check-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) as mint,
  'ts-pair-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) as pair_address,
  now() - interval '3 second' as ts1,
  now() - interval '2 second' as ts2,
  now() - interval '1 second' as ts3;

select public.upsert_tokens_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'name', 'Token Check',
      'symbol', 'TSC',
      'description', 'timestamp semantics',
      'image_uri', 'https://example.com/a.png',
      'updated_at', (select ts1 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_pairs_diff(
  jsonb_build_array(
    jsonb_build_object(
      'pair_address', (select pair_address from _ts_semantics_ctx),
      'mint', (select mint from _ts_semantics_ctx),
      'dex', 'dexscreener',
      'quote_symbol', 'SOL',
      'pair_created_at_ms', 1700000000000,
      'updated_at', (select ts1 from _ts_semantics_ctx),
      'ingested_at', (select ts1 from _ts_semantics_ctx),
      'source_discovery', 'dexscreener'
    )
  )
);

select public.upsert_token_market_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'primary_pair_address', (select pair_address from _ts_semantics_ctx),
      'price_usd', 1.11,
      'price_change_24h', 2.22,
      'volume_24h', 3.33,
      'liquidity', 4.44,
      'market_cap', null,
      'recent_volume_5m', 5.55,
      'recent_txns_5m', 6,
      'source_price', 'dexscreener',
      'source_market_cap', 'unavailable',
      'source_liquidity', 'dexscreener',
      'source_volume', 'dexscreener',
      'source_metadata', 'helius',
      'updated_at', (select ts1 from _ts_semantics_ctx),
      'ingested_at', (select ts1 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_labels_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'category', 'trending',
      'risk_tier', 'allow',
      'trust_tags', array['verified'],
      'discovery_labels', array['trending'],
      'source_tags', array['internal'],
      'source_labels', 'derived',
      'updated_at', (select ts1 from _ts_semantics_ctx),
      'ingested_at', (select ts1 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_sparklines_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'window', '6h',
      'interval', '5m',
      'points', 3,
      'source', 'historical_provider',
      'generated_at', (select ts1 from _ts_semantics_ctx),
      'history_quality', 'real_backfill',
      'point_count_1m', 360,
      'last_point_time_sec', 1704460800,
      'sparkline', array[1.0, 2.0, 3.0],
      'updated_at', (select ts1 from _ts_semantics_ctx),
      'ingested_at', (select ts1 from _ts_semantics_ctx)
    )
  )
);

create temporary table _ts_first as
select
  t.updated_at as tokens_updated_at,
  tp.updated_at as pairs_updated_at,
  tp.ingested_at as pairs_ingested_at,
  tm.updated_at as market_updated_at,
  tm.ingested_at as market_ingested_at,
  tm.market_cap as market_cap,
  tl.updated_at as labels_updated_at,
  tl.ingested_at as labels_ingested_at,
  ts.updated_at as sparkline_updated_at,
  ts.ingested_at as sparkline_ingested_at
from public.tokens t
join public.token_pairs tp on tp.mint = t.mint
join public.token_market_latest tm on tm.mint = t.mint
join public.token_labels_latest tl on tl.mint = t.mint
join public.token_sparklines_latest ts on ts.mint = t.mint
where t.mint = (select mint from _ts_semantics_ctx);

-- Identical business values, newer ingest/write timestamp.
select public.upsert_tokens_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'name', 'Token Check',
      'symbol', 'TSC',
      'description', 'timestamp semantics',
      'image_uri', 'https://example.com/a.png',
      'updated_at', (select ts2 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_pairs_diff(
  jsonb_build_array(
    jsonb_build_object(
      'pair_address', (select pair_address from _ts_semantics_ctx),
      'mint', (select mint from _ts_semantics_ctx),
      'dex', 'dexscreener',
      'quote_symbol', 'SOL',
      'pair_created_at_ms', 1700000000000,
      'updated_at', (select ts2 from _ts_semantics_ctx),
      'ingested_at', (select ts2 from _ts_semantics_ctx),
      'source_discovery', 'dexscreener'
    )
  )
);

select public.upsert_token_market_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'primary_pair_address', (select pair_address from _ts_semantics_ctx),
      'price_usd', 1.11,
      'price_change_24h', 2.22,
      'volume_24h', 3.33,
      'liquidity', 4.44,
      'market_cap', null,
      'recent_volume_5m', 5.55,
      'recent_txns_5m', 6,
      'source_price', 'dexscreener',
      'source_market_cap', 'unavailable',
      'source_liquidity', 'dexscreener',
      'source_volume', 'dexscreener',
      'source_metadata', 'helius',
      'updated_at', (select ts2 from _ts_semantics_ctx),
      'ingested_at', (select ts2 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_labels_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'category', 'trending',
      'risk_tier', 'allow',
      'trust_tags', array['verified'],
      'discovery_labels', array['trending'],
      'source_tags', array['internal'],
      'source_labels', 'derived',
      'updated_at', (select ts2 from _ts_semantics_ctx),
      'ingested_at', (select ts2 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_sparklines_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'window', '6h',
      'interval', '5m',
      'points', 3,
      'source', 'historical_provider',
      'generated_at', (select ts1 from _ts_semantics_ctx),
      'history_quality', 'real_backfill',
      'point_count_1m', 360,
      'last_point_time_sec', 1704460800,
      'sparkline', array[1.0, 2.0, 3.0],
      'updated_at', (select ts2 from _ts_semantics_ctx),
      'ingested_at', (select ts2 from _ts_semantics_ctx)
    )
  )
);

create temporary table _ts_second as
select
  t.updated_at as tokens_updated_at,
  tp.updated_at as pairs_updated_at,
  tp.ingested_at as pairs_ingested_at,
  tm.updated_at as market_updated_at,
  tm.ingested_at as market_ingested_at,
  tm.market_cap as market_cap,
  tl.updated_at as labels_updated_at,
  tl.ingested_at as labels_ingested_at,
  ts.updated_at as sparkline_updated_at,
  ts.ingested_at as sparkline_ingested_at
from public.tokens t
join public.token_pairs tp on tp.mint = t.mint
join public.token_market_latest tm on tm.mint = t.mint
join public.token_labels_latest tl on tl.mint = t.mint
join public.token_sparklines_latest ts on ts.mint = t.mint
where t.mint = (select mint from _ts_semantics_ctx);

-- Business-value changes with newer update/ingest timestamps.
select public.upsert_tokens_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'name', 'Token Check Updated',
      'symbol', 'TSC',
      'description', 'timestamp semantics',
      'image_uri', 'https://example.com/a.png',
      'updated_at', (select ts3 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_pairs_diff(
  jsonb_build_array(
    jsonb_build_object(
      'pair_address', (select pair_address from _ts_semantics_ctx),
      'mint', (select mint from _ts_semantics_ctx),
      'dex', 'dexscreener',
      'quote_symbol', 'USDC',
      'pair_created_at_ms', 1700000000000,
      'updated_at', (select ts3 from _ts_semantics_ctx),
      'ingested_at', (select ts3 from _ts_semantics_ctx),
      'source_discovery', 'dexscreener'
    )
  )
);

select public.upsert_token_market_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'primary_pair_address', (select pair_address from _ts_semantics_ctx),
      'price_usd', 1.11,
      'price_change_24h', 2.22,
      'volume_24h', 3.33,
      'liquidity', 4.44,
      'market_cap', 42.0,
      'recent_volume_5m', 5.55,
      'recent_txns_5m', 6,
      'source_price', 'dexscreener',
      'source_market_cap', 'dexscreener_market_cap',
      'source_liquidity', 'dexscreener',
      'source_volume', 'dexscreener',
      'source_metadata', 'helius',
      'updated_at', (select ts3 from _ts_semantics_ctx),
      'ingested_at', (select ts3 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_labels_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'category', 'trending',
      'risk_tier', 'warn',
      'trust_tags', array['verified'],
      'discovery_labels', array['trending'],
      'source_tags', array['internal'],
      'source_labels', 'derived',
      'updated_at', (select ts3 from _ts_semantics_ctx),
      'ingested_at', (select ts3 from _ts_semantics_ctx)
    )
  )
);

select public.upsert_token_sparklines_latest_diff(
  jsonb_build_array(
    jsonb_build_object(
      'mint', (select mint from _ts_semantics_ctx),
      'window', '6h',
      'interval', '5m',
      'points', 4,
      'source', 'historical_provider',
      'generated_at', (select ts3 from _ts_semantics_ctx),
      'history_quality', 'real_backfill',
      'point_count_1m', 361,
      'last_point_time_sec', 1704460860,
      'sparkline', array[1.0, 2.0, 3.0, 4.0],
      'updated_at', (select ts3 from _ts_semantics_ctx),
      'ingested_at', (select ts3 from _ts_semantics_ctx)
    )
  )
);

create temporary table _ts_third as
select
  t.updated_at as tokens_updated_at,
  tp.updated_at as pairs_updated_at,
  tp.ingested_at as pairs_ingested_at,
  tm.updated_at as market_updated_at,
  tm.ingested_at as market_ingested_at,
  tm.market_cap as market_cap,
  tl.updated_at as labels_updated_at,
  tl.ingested_at as labels_ingested_at,
  ts.updated_at as sparkline_updated_at,
  ts.ingested_at as sparkline_ingested_at
from public.tokens t
join public.token_pairs tp on tp.mint = t.mint
join public.token_market_latest tm on tm.mint = t.mint
join public.token_labels_latest tl on tl.mint = t.mint
join public.token_sparklines_latest ts on ts.mint = t.mint
where t.mint = (select mint from _ts_semantics_ctx);

select
  (s.tokens_updated_at = f.tokens_updated_at) as tokens_updated_stable_on_identical,
  (s.pairs_updated_at = f.pairs_updated_at) as pairs_updated_stable_on_identical,
  (s.market_updated_at = f.market_updated_at) as market_updated_stable_on_identical,
  (s.labels_updated_at = f.labels_updated_at) as labels_updated_stable_on_identical,
  (s.sparkline_updated_at = f.sparkline_updated_at) as sparkline_updated_stable_on_identical,
  (s.pairs_ingested_at > f.pairs_ingested_at) as pairs_ingested_advances_on_identical,
  (s.market_ingested_at > f.market_ingested_at) as market_ingested_advances_on_identical,
  (s.labels_ingested_at > f.labels_ingested_at) as labels_ingested_advances_on_identical,
  (s.sparkline_ingested_at > f.sparkline_ingested_at) as sparkline_ingested_advances_on_identical,
  (t.tokens_updated_at > s.tokens_updated_at) as tokens_updated_advances_on_change,
  (t.pairs_updated_at > s.pairs_updated_at) as pairs_updated_advances_on_change,
  (t.market_updated_at > s.market_updated_at) as market_updated_advances_on_change,
  (t.labels_updated_at > s.labels_updated_at) as labels_updated_advances_on_change,
  (t.sparkline_updated_at > s.sparkline_updated_at) as sparkline_updated_advances_on_change,
  (s.market_cap is null and t.market_cap = 42.0) as market_cap_null_to_value_transition_verified
from _ts_first f
cross join _ts_second s
cross join _ts_third t;

delete from public.tokens
where mint = (select mint from _ts_semantics_ctx);
