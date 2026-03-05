create table if not exists public.token_pairs (
  pair_address text primary key,
  mint text not null references public.tokens(mint) on delete cascade,
  dex text not null,
  quote_symbol text null,
  pair_created_at_ms bigint null,
  updated_at timestamptz not null default now(),
  ingested_at timestamptz null,
  source_discovery text not null
);

with ranked_pairs as (
  select
    tm.pair_address,
    tm.mint,
    tm.quote_symbol,
    tm.pair_created_at_ms,
    tm.updated_at,
    tm.market_source_price,
    row_number() over (
      partition by tm.pair_address
      order by tm.updated_at desc nulls last, tm.mint asc
    ) as rn
  from public.token_market_latest tm
  where tm.pair_address is not null
    and length(trim(tm.pair_address)) > 0
)
insert into public.token_pairs (
  pair_address,
  mint,
  dex,
  quote_symbol,
  pair_created_at_ms,
  updated_at,
  ingested_at,
  source_discovery
)
select
  rp.pair_address,
  rp.mint,
  case
    when rp.market_source_price = 'seed' then 'seed'
    else 'dexscreener'
  end as dex,
  rp.quote_symbol,
  rp.pair_created_at_ms,
  coalesce(rp.updated_at, now()) as updated_at,
  now() as ingested_at,
  case
    when rp.market_source_price = 'seed' then 'seed'
    else 'dexscreener'
  end as source_discovery
from ranked_pairs rp
where rp.rn = 1
on conflict (pair_address) do update
set
  mint = excluded.mint,
  dex = excluded.dex,
  quote_symbol = excluded.quote_symbol,
  pair_created_at_ms = excluded.pair_created_at_ms,
  updated_at = excluded.updated_at,
  ingested_at = excluded.ingested_at,
  source_discovery = excluded.source_discovery;

alter table if exists public.token_market_latest
  add column if not exists primary_pair_address text null,
  add column if not exists source_price text null,
  add column if not exists source_market_cap text null,
  add column if not exists source_liquidity text null,
  add column if not exists source_volume text null,
  add column if not exists source_metadata text null,
  add column if not exists ingested_at timestamptz null;

update public.token_market_latest
set
  primary_pair_address = coalesce(primary_pair_address, nullif(trim(pair_address), '')),
  source_price = coalesce(source_price, market_source_price, 'seed'),
  source_market_cap = coalesce(source_market_cap, market_source_market_cap, 'unavailable'),
  source_liquidity = coalesce(source_liquidity, market_source_price, 'seed'),
  source_volume = coalesce(source_volume, market_source_price, 'seed'),
  source_metadata = coalesce(source_metadata, metadata_source, 'seed'),
  ingested_at = coalesce(ingested_at, now())
where
  primary_pair_address is null
  or source_price is null
  or source_market_cap is null
  or source_liquidity is null
  or source_volume is null
  or source_metadata is null
  or ingested_at is null;

alter table if exists public.token_labels_latest
  add column if not exists source_labels text null,
  add column if not exists ingested_at timestamptz null;

update public.token_labels_latest
set
  source_labels = coalesce(source_labels, 'derived'),
  ingested_at = coalesce(ingested_at, now())
where source_labels is null or ingested_at is null;

alter table if exists public.token_sparklines_latest
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists ingested_at timestamptz null;

update public.token_sparklines_latest
set
  updated_at = coalesce(updated_at, generated_at, now()),
  ingested_at = coalesce(ingested_at, now())
where ingested_at is null;

alter table if exists public.token_candles_1m
  add column if not exists time_sec bigint null,
  add column if not exists source text null,
  add column if not exists updated_at timestamptz null,
  add column if not exists ingested_at timestamptz null;

update public.token_candles_1m
set
  time_sec = coalesce(time_sec, floor(extract(epoch from bucket_start))::bigint),
  source = coalesce(source, 'runtime_aggregator'),
  updated_at = coalesce(updated_at, bucket_start, now()),
  ingested_at = coalesce(ingested_at, now())
where
  time_sec is null
  or source is null
  or updated_at is null
  or ingested_at is null;
