alter table if exists public.token_sparklines_latest
  add column if not exists point_count_1m integer null,
  add column if not exists last_point_time_sec bigint null;

create or replace view public.v_token_feed with (security_invoker = true) as
select
  t.mint,
  t.name,
  t.symbol,
  t.description,
  t.image_uri as "imageUri",
  tm.price_usd as "priceUsd",
  tm.price_change_24h as "priceChange24h",
  tm.volume_24h as "volume24h",
  tm.liquidity,
  tm.market_cap as "marketCap",
  tm.pair_address as "pairAddress",
  tm.pair_created_at_ms as "pairCreatedAtMs",
  tm.quote_symbol as "quoteSymbol",
  tm.recent_volume_5m as "recentVolume5m",
  tm.recent_txns_5m as "recentTxns5m",
  coalesce(ts.sparkline, '{}'::numeric[]) as sparkline,
  case
    when ts.mint is null then null
    else jsonb_build_object(
      'window', ts."window",
      'interval', ts.interval,
      'source', ts.source,
      'points', ts.points,
      'generatedAt', ts.generated_at,
      'historyQuality', ts.history_quality,
      'pointCount1m', ts.point_count_1m,
      'lastPointTimeSec', ts.last_point_time_sec
    )
  end as "sparklineMeta",
  jsonb_build_object(
    'trust', coalesce(tl.trust_tags, '{}'::text[]),
    'discovery', coalesce(tl.discovery_labels, '{}'::text[])
  ) as tags,
  coalesce(tl.discovery_labels, '{}'::text[]) as labels,
  jsonb_build_object(
    'price', tm.market_source_price,
    'liquidity', tm.market_source_price,
    'volume', tm.market_source_price,
    'marketCap', tm.market_source_market_cap,
    'metadata', tm.metadata_source,
    'tags', coalesce(tl.source_tags, '{}'::text[])
  ) as sources,
  tl.category,
  tl.risk_tier as "riskTier"
from public.tokens t
join public.token_market_latest tm on tm.mint = t.mint
join public.token_labels_latest tl on tl.mint = t.mint
left join public.token_sparklines_latest ts on ts.mint = t.mint;
