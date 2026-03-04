create extension if not exists pgcrypto;

create table if not exists public.tokens (
  mint text primary key,
  name text not null,
  symbol text not null,
  description text null,
  image_uri text null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_market_latest (
  mint text primary key references public.tokens(mint) on delete cascade,
  price_usd numeric not null,
  price_change_24h numeric not null,
  volume_24h numeric not null,
  liquidity numeric not null,
  market_cap numeric null,
  pair_address text null,
  pair_created_at_ms bigint null,
  quote_symbol text null,
  recent_volume_5m numeric null,
  recent_txns_5m integer null,
  market_source_price text not null,
  market_source_market_cap text not null,
  metadata_source text not null,
  updated_at timestamptz not null
);

create table if not exists public.token_labels_latest (
  mint text primary key references public.tokens(mint) on delete cascade,
  category text not null check (category in ('trending', 'gainer', 'new', 'memecoin')),
  risk_tier text not null check (risk_tier in ('block', 'warn', 'allow')),
  trust_tags text[] not null default '{}',
  discovery_labels text[] not null default '{}',
  source_tags text[] not null default '{}',
  updated_at timestamptz not null
);

create table if not exists public.token_sparklines_latest (
  mint text primary key references public.tokens(mint) on delete cascade,
  "window" text not null check ("window" = '6h'),
  interval text not null check (interval in ('1m', '5m')),
  points integer not null,
  source text not null,
  generated_at timestamptz not null,
  history_quality text null,
  candle_count_1m integer null,
  sparkline numeric[] not null
);

create table if not exists public.token_candles_1m (
  pair_address text not null,
  bucket_start timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  sample_count integer not null,
  primary key (pair_address, bucket_start)
);

create table if not exists public.feed_snapshots (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null,
  source text not null check (source in ('providers', 'seed')),
  cache_status text not null check (cache_status in ('HIT', 'MISS', 'STALE')),
  item_count integer not null
);

create table if not exists public.feed_snapshot_items (
  snapshot_id uuid not null references public.feed_snapshots(id) on delete cascade,
  position integer not null,
  mint text not null references public.tokens(mint) on delete cascade,
  score numeric not null,
  primary key (snapshot_id, position),
  unique (snapshot_id, mint)
);

create index if not exists idx_token_market_latest_pair_address on public.token_market_latest(pair_address);
create index if not exists idx_token_market_latest_volume_24h_desc on public.token_market_latest(volume_24h desc);
create index if not exists idx_token_candles_1m_bucket_start_desc on public.token_candles_1m(bucket_start desc);
create index if not exists idx_feed_snapshots_generated_at_desc on public.feed_snapshots(generated_at desc);
create index if not exists idx_feed_snapshot_items_snapshot_id_position on public.feed_snapshot_items(snapshot_id, position);
create index if not exists idx_feed_snapshot_items_mint on public.feed_snapshot_items(mint);

alter table public.tokens enable row level security;
alter table public.token_market_latest enable row level security;
alter table public.token_labels_latest enable row level security;
alter table public.token_sparklines_latest enable row level security;
alter table public.token_candles_1m enable row level security;
alter table public.feed_snapshots enable row level security;
alter table public.feed_snapshot_items enable row level security;

drop policy if exists token_public_read on public.tokens;
create policy token_public_read on public.tokens for select to anon, authenticated using (true);

drop policy if exists token_market_public_read on public.token_market_latest;
create policy token_market_public_read on public.token_market_latest for select to anon, authenticated using (true);

drop policy if exists token_labels_public_read on public.token_labels_latest;
create policy token_labels_public_read on public.token_labels_latest for select to anon, authenticated using (true);

drop policy if exists token_sparklines_public_read on public.token_sparklines_latest;
create policy token_sparklines_public_read on public.token_sparklines_latest for select to anon, authenticated using (true);

drop policy if exists token_candles_public_read on public.token_candles_1m;
create policy token_candles_public_read on public.token_candles_1m for select to anon, authenticated using (true);

drop policy if exists feed_snapshots_deny_client_read on public.feed_snapshots;
create policy feed_snapshots_deny_client_read on public.feed_snapshots for select to anon, authenticated using (false);

drop policy if exists feed_snapshot_items_deny_client_read on public.feed_snapshot_items;
create policy feed_snapshot_items_deny_client_read on public.feed_snapshot_items for select to anon, authenticated using (false);

drop view if exists public.v_token_feed;

create view public.v_token_feed with (security_invoker = true) as
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
      'candleCount1m', ts.candle_count_1m
    )
  end as "sparklineMeta",
  jsonb_build_object(
    'trust', coalesce(tl.trust_tags, '{}'::text[]),
    'discovery', coalesce(tl.discovery_labels, '{}'::text[])
  ) as tags,
  coalesce(tl.discovery_labels, '{}'::text[]) as labels,
  jsonb_build_object(
    'price', tm.market_source_price,
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

grant select on public.tokens to anon, authenticated;
grant select on public.token_market_latest to anon, authenticated;
grant select on public.token_labels_latest to anon, authenticated;
grant select on public.token_sparklines_latest to anon, authenticated;
grant select on public.token_candles_1m to anon, authenticated;
grant select on public.v_token_feed to anon, authenticated;
