alter table public.token_pairs enable row level security;

drop policy if exists token_pairs_public_read on public.token_pairs;
create policy token_pairs_public_read
  on public.token_pairs
  for select
  to anon, authenticated
  using (true);

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
  tm.primary_pair_address as "pairAddress",
  tp.pair_created_at_ms as "pairCreatedAtMs",
  tp.quote_symbol as "quoteSymbol",
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
    'price', tm.source_price,
    'liquidity', coalesce(tm.source_liquidity, tm.source_price),
    'volume', coalesce(tm.source_volume, tm.source_price),
    'marketCap', tm.source_market_cap,
    'metadata', tm.source_metadata,
    'tags', coalesce(tl.source_tags, '{}'::text[])
  ) as sources,
  tl.category,
  tl.risk_tier as "riskTier"
from public.tokens t
join public.token_market_latest tm on tm.mint = t.mint
join public.token_labels_latest tl on tl.mint = t.mint
left join public.token_pairs tp on tp.pair_address = tm.primary_pair_address
left join public.token_sparklines_latest ts on ts.mint = t.mint;

grant select on public.token_pairs to anon, authenticated;
grant select on public.v_token_feed to anon, authenticated;
