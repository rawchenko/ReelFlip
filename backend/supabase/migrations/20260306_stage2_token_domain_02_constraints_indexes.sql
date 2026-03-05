alter table public.token_market_latest
  alter column source_price set not null,
  alter column source_market_cap set not null,
  alter column source_liquidity set not null,
  alter column source_volume set not null,
  alter column source_metadata set not null;

alter table public.token_labels_latest
  alter column source_labels set default 'derived',
  alter column source_labels set not null;

alter table public.token_sparklines_latest
  alter column updated_at set not null;

alter table public.token_candles_1m
  alter column time_sec set not null,
  alter column source set not null,
  alter column updated_at set not null;

delete from public.token_candles_1m older
using public.token_candles_1m newer
where older.ctid < newer.ctid
  and older.pair_address = newer.pair_address
  and older.time_sec = newer.time_sec;

alter table public.token_candles_1m
  drop constraint if exists token_candles_1m_pkey;

alter table public.token_candles_1m
  add constraint token_candles_1m_pkey primary key (pair_address, time_sec);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'token_market_latest_primary_pair_address_fkey'
  ) then
    alter table public.token_market_latest
      add constraint token_market_latest_primary_pair_address_fkey
      foreign key (primary_pair_address)
      references public.token_pairs(pair_address)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'token_labels_latest_category_check'
  ) then
    alter table public.token_labels_latest
      add constraint token_labels_latest_category_check
      check (category in ('trending', 'gainer', 'new', 'memecoin'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'token_labels_latest_risk_tier_check'
  ) then
    alter table public.token_labels_latest
      add constraint token_labels_latest_risk_tier_check
      check (risk_tier in ('block', 'warn', 'allow'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'token_sparklines_latest_window_check'
  ) then
    alter table public.token_sparklines_latest
      add constraint token_sparklines_latest_window_check
      check ("window" = '6h');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'token_sparklines_latest_interval_check'
  ) then
    alter table public.token_sparklines_latest
      add constraint token_sparklines_latest_interval_check
      check (interval in ('1m', '5m'));
  end if;
end $$;

create index if not exists idx_token_market_latest_primary_pair_address
  on public.token_market_latest(primary_pair_address);
create index if not exists idx_token_market_latest_updated_at_desc
  on public.token_market_latest(updated_at desc);
create index if not exists idx_token_market_latest_market_cap_desc
  on public.token_market_latest(market_cap desc);
create index if not exists idx_token_market_latest_volume_24h_desc
  on public.token_market_latest(volume_24h desc);
create index if not exists idx_token_labels_latest_risk_tier_updated_at_desc
  on public.token_labels_latest(risk_tier, updated_at desc);
create index if not exists idx_token_pairs_mint_updated_at_desc
  on public.token_pairs(mint, updated_at desc);
create index if not exists idx_token_candles_1m_pair_time_sec_desc
  on public.token_candles_1m(pair_address, time_sec desc);
create index if not exists idx_token_candles_1m_time_sec_desc
  on public.token_candles_1m(time_sec desc);
