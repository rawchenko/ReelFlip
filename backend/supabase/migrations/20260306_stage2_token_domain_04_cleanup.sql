alter table if exists public.token_market_latest
  drop column if exists pair_address,
  drop column if exists pair_created_at_ms,
  drop column if exists quote_symbol,
  drop column if exists market_source_price,
  drop column if exists market_source_market_cap,
  drop column if exists metadata_source;

alter table if exists public.token_candles_1m
  drop column if exists bucket_start;

alter table if exists public.token_sparklines_latest
  drop column if exists candle_count_1m;

drop index if exists public.idx_token_market_latest_pair_address;
drop index if exists public.idx_token_candles_1m_bucket_start_desc;

create index if not exists idx_token_market_latest_primary_pair_address
  on public.token_market_latest(primary_pair_address);
create index if not exists idx_token_candles_1m_pair_time_sec_desc
  on public.token_candles_1m(pair_address, time_sec desc);
create index if not exists idx_token_candles_1m_time_sec_desc
  on public.token_candles_1m(time_sec desc);
