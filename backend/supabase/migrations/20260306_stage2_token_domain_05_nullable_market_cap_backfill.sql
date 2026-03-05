do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'token_market_latest'
      and column_name = 'source_market_cap'
  ) then
    update public.token_market_latest
    set market_cap = null
    where market_cap = 0
      and source_market_cap = 'unavailable';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'token_market_latest'
      and column_name = 'market_source_market_cap'
  ) then
    update public.token_market_latest
    set market_cap = null
    where market_cap = 0
      and market_source_market_cap = 'unavailable';
  end if;
end $$;
