-- Stage 2 referential integrity hardening: enforce candle -> pair FK.
-- Cleanup orphan candles first so validation can succeed.

delete from public.token_candles_1m candles
where not exists (
  select 1
  from public.token_pairs pairs
  where pairs.pair_address = candles.pair_address
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'token_candles_1m_pair_address_fkey'
      and conrelid = 'public.token_candles_1m'::regclass
  ) then
    alter table public.token_candles_1m
      add constraint token_candles_1m_pair_address_fkey
      foreign key (pair_address)
      references public.token_pairs(pair_address)
      on delete cascade
      not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'token_candles_1m_pair_address_fkey'
      and conrelid = 'public.token_candles_1m'::regclass
      and convalidated = false
  ) then
    alter table public.token_candles_1m
      validate constraint token_candles_1m_pair_address_fkey;
  end if;
end $$;
