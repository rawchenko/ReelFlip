-- Stage 2 hardening: enforce view-only read surface for non-service clients.
-- Keep anon/authenticated access on v_token_feed only.

create or replace view public.v_token_feed
with (
  security_invoker = true,
  security_barrier = true
) as
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

-- Remove broad base-table read access for client roles.
revoke select on table public.tokens from anon, authenticated;
revoke select on table public.token_pairs from anon, authenticated;
revoke select on table public.token_market_latest from anon, authenticated;
revoke select on table public.token_labels_latest from anon, authenticated;
revoke select on table public.token_sparklines_latest from anon, authenticated;
revoke select on table public.token_candles_1m from anon, authenticated;
revoke select on table public.feed_snapshots from anon, authenticated;
revoke select on table public.feed_snapshot_items from anon, authenticated;

-- Keep explicit client access on the read-facing view only.
grant select on table public.v_token_feed to anon, authenticated;

-- Drop permissive client read policies from base tables.
drop policy if exists token_public_read on public.tokens;
drop policy if exists token_pairs_public_read on public.token_pairs;
drop policy if exists token_market_public_read on public.token_market_latest;
drop policy if exists token_labels_public_read on public.token_labels_latest;
drop policy if exists token_sparklines_public_read on public.token_sparklines_latest;
drop policy if exists token_candles_public_read on public.token_candles_1m;

-- Preserve explicit deny policies on snapshots as defense in depth.
drop policy if exists feed_snapshots_deny_client_read on public.feed_snapshots;
create policy feed_snapshots_deny_client_read
  on public.feed_snapshots
  for select
  to anon, authenticated
  using (false);

drop policy if exists feed_snapshot_items_deny_client_read on public.feed_snapshot_items;
create policy feed_snapshot_items_deny_client_read
  on public.feed_snapshot_items
  for select
  to anon, authenticated
  using (false);

-- Ensure backend service role keeps explicit DML access to managed tables.
grant select, insert, update, delete on table public.tokens to service_role;
grant select, insert, update, delete on table public.token_pairs to service_role;
grant select, insert, update, delete on table public.token_market_latest to service_role;
grant select, insert, update, delete on table public.token_labels_latest to service_role;
grant select, insert, update, delete on table public.token_sparklines_latest to service_role;
grant select, insert, update, delete on table public.token_candles_1m to service_role;
grant select, insert, update, delete on table public.feed_snapshots to service_role;
grant select, insert, update, delete on table public.feed_snapshot_items to service_role;
grant select on table public.v_token_feed to service_role;
