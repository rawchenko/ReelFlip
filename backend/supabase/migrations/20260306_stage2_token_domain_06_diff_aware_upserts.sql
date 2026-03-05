create or replace function public.upsert_tokens_diff(rows jsonb)
returns void
language plpgsql
as $$
begin
  insert into public.tokens (
    mint,
    name,
    symbol,
    description,
    image_uri,
    updated_at
  )
  select
    r.mint,
    r.name,
    r.symbol,
    r.description,
    r.image_uri,
    r.updated_at
  from jsonb_to_recordset(coalesce(rows, '[]'::jsonb)) as r(
    mint text,
    name text,
    symbol text,
    description text,
    image_uri text,
    updated_at timestamptz
  )
  on conflict (mint) do update
  set
    name = excluded.name,
    symbol = excluded.symbol,
    description = excluded.description,
    image_uri = excluded.image_uri,
    updated_at = case
      when tokens.name is distinct from excluded.name
        or tokens.symbol is distinct from excluded.symbol
        or tokens.description is distinct from excluded.description
        or tokens.image_uri is distinct from excluded.image_uri
        then excluded.updated_at
      else tokens.updated_at
    end;
end;
$$;

create or replace function public.upsert_token_pairs_diff(rows jsonb)
returns void
language plpgsql
as $$
begin
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
    r.pair_address,
    r.mint,
    r.dex,
    r.quote_symbol,
    r.pair_created_at_ms,
    r.updated_at,
    r.ingested_at,
    r.source_discovery
  from jsonb_to_recordset(coalesce(rows, '[]'::jsonb)) as r(
    pair_address text,
    mint text,
    dex text,
    quote_symbol text,
    pair_created_at_ms bigint,
    updated_at timestamptz,
    ingested_at timestamptz,
    source_discovery text
  )
  on conflict (pair_address) do update
  set
    mint = excluded.mint,
    dex = excluded.dex,
    quote_symbol = excluded.quote_symbol,
    pair_created_at_ms = excluded.pair_created_at_ms,
    source_discovery = excluded.source_discovery,
    ingested_at = excluded.ingested_at,
    updated_at = case
      when token_pairs.mint is distinct from excluded.mint
        or token_pairs.dex is distinct from excluded.dex
        or token_pairs.quote_symbol is distinct from excluded.quote_symbol
        or token_pairs.pair_created_at_ms is distinct from excluded.pair_created_at_ms
        or token_pairs.source_discovery is distinct from excluded.source_discovery
        then excluded.updated_at
      else token_pairs.updated_at
    end;
end;
$$;

create or replace function public.upsert_token_market_latest_diff(rows jsonb)
returns void
language plpgsql
as $$
begin
  insert into public.token_market_latest (
    mint,
    primary_pair_address,
    price_usd,
    price_change_24h,
    volume_24h,
    liquidity,
    market_cap,
    recent_volume_5m,
    recent_txns_5m,
    source_price,
    source_market_cap,
    source_liquidity,
    source_volume,
    source_metadata,
    updated_at,
    ingested_at
  )
  select
    r.mint,
    r.primary_pair_address,
    r.price_usd,
    r.price_change_24h,
    r.volume_24h,
    r.liquidity,
    r.market_cap,
    r.recent_volume_5m,
    r.recent_txns_5m,
    r.source_price,
    r.source_market_cap,
    r.source_liquidity,
    r.source_volume,
    r.source_metadata,
    r.updated_at,
    r.ingested_at
  from jsonb_to_recordset(coalesce(rows, '[]'::jsonb)) as r(
    mint text,
    primary_pair_address text,
    price_usd numeric,
    price_change_24h numeric,
    volume_24h numeric,
    liquidity numeric,
    market_cap numeric,
    recent_volume_5m numeric,
    recent_txns_5m integer,
    source_price text,
    source_market_cap text,
    source_liquidity text,
    source_volume text,
    source_metadata text,
    updated_at timestamptz,
    ingested_at timestamptz
  )
  on conflict (mint) do update
  set
    primary_pair_address = excluded.primary_pair_address,
    price_usd = excluded.price_usd,
    price_change_24h = excluded.price_change_24h,
    volume_24h = excluded.volume_24h,
    liquidity = excluded.liquidity,
    market_cap = excluded.market_cap,
    recent_volume_5m = excluded.recent_volume_5m,
    recent_txns_5m = excluded.recent_txns_5m,
    source_price = excluded.source_price,
    source_market_cap = excluded.source_market_cap,
    source_liquidity = excluded.source_liquidity,
    source_volume = excluded.source_volume,
    source_metadata = excluded.source_metadata,
    ingested_at = excluded.ingested_at,
    updated_at = case
      when token_market_latest.primary_pair_address is distinct from excluded.primary_pair_address
        or token_market_latest.price_usd is distinct from excluded.price_usd
        or token_market_latest.price_change_24h is distinct from excluded.price_change_24h
        or token_market_latest.volume_24h is distinct from excluded.volume_24h
        or token_market_latest.liquidity is distinct from excluded.liquidity
        or token_market_latest.market_cap is distinct from excluded.market_cap
        or token_market_latest.recent_volume_5m is distinct from excluded.recent_volume_5m
        or token_market_latest.recent_txns_5m is distinct from excluded.recent_txns_5m
        or token_market_latest.source_price is distinct from excluded.source_price
        or token_market_latest.source_market_cap is distinct from excluded.source_market_cap
        or token_market_latest.source_liquidity is distinct from excluded.source_liquidity
        or token_market_latest.source_volume is distinct from excluded.source_volume
        or token_market_latest.source_metadata is distinct from excluded.source_metadata
        then excluded.updated_at
      else token_market_latest.updated_at
    end;
end;
$$;

create or replace function public.upsert_token_labels_latest_diff(rows jsonb)
returns void
language plpgsql
as $$
begin
  insert into public.token_labels_latest (
    mint,
    category,
    risk_tier,
    trust_tags,
    discovery_labels,
    source_tags,
    source_labels,
    updated_at,
    ingested_at
  )
  select
    r.mint,
    r.category,
    r.risk_tier,
    r.trust_tags,
    r.discovery_labels,
    r.source_tags,
    r.source_labels,
    r.updated_at,
    r.ingested_at
  from jsonb_to_recordset(coalesce(rows, '[]'::jsonb)) as r(
    mint text,
    category text,
    risk_tier text,
    trust_tags text[],
    discovery_labels text[],
    source_tags text[],
    source_labels text,
    updated_at timestamptz,
    ingested_at timestamptz
  )
  on conflict (mint) do update
  set
    category = excluded.category,
    risk_tier = excluded.risk_tier,
    trust_tags = excluded.trust_tags,
    discovery_labels = excluded.discovery_labels,
    source_tags = excluded.source_tags,
    source_labels = excluded.source_labels,
    ingested_at = excluded.ingested_at,
    updated_at = case
      when token_labels_latest.category is distinct from excluded.category
        or token_labels_latest.risk_tier is distinct from excluded.risk_tier
        or token_labels_latest.trust_tags is distinct from excluded.trust_tags
        or token_labels_latest.discovery_labels is distinct from excluded.discovery_labels
        or token_labels_latest.source_tags is distinct from excluded.source_tags
        or token_labels_latest.source_labels is distinct from excluded.source_labels
        then excluded.updated_at
      else token_labels_latest.updated_at
    end;
end;
$$;

create or replace function public.upsert_token_sparklines_latest_diff(rows jsonb)
returns void
language plpgsql
as $$
begin
  insert into public.token_sparklines_latest (
    mint,
    "window",
    interval,
    points,
    source,
    generated_at,
    history_quality,
    point_count_1m,
    last_point_time_sec,
    sparkline,
    updated_at,
    ingested_at
  )
  select
    r.mint,
    r."window",
    r.interval,
    r.points,
    r.source,
    r.generated_at,
    r.history_quality,
    r.point_count_1m,
    r.last_point_time_sec,
    r.sparkline,
    r.updated_at,
    r.ingested_at
  from jsonb_to_recordset(coalesce(rows, '[]'::jsonb)) as r(
    mint text,
    "window" text,
    interval text,
    points integer,
    source text,
    generated_at timestamptz,
    history_quality text,
    point_count_1m integer,
    last_point_time_sec bigint,
    sparkline numeric[],
    updated_at timestamptz,
    ingested_at timestamptz
  )
  on conflict (mint) do update
  set
    "window" = excluded."window",
    interval = excluded.interval,
    points = excluded.points,
    source = excluded.source,
    generated_at = excluded.generated_at,
    history_quality = excluded.history_quality,
    point_count_1m = excluded.point_count_1m,
    last_point_time_sec = excluded.last_point_time_sec,
    sparkline = excluded.sparkline,
    ingested_at = excluded.ingested_at,
    updated_at = case
      when token_sparklines_latest."window" is distinct from excluded."window"
        or token_sparklines_latest.interval is distinct from excluded.interval
        or token_sparklines_latest.points is distinct from excluded.points
        or token_sparklines_latest.source is distinct from excluded.source
        or token_sparklines_latest.generated_at is distinct from excluded.generated_at
        or token_sparklines_latest.history_quality is distinct from excluded.history_quality
        or token_sparklines_latest.point_count_1m is distinct from excluded.point_count_1m
        or token_sparklines_latest.last_point_time_sec is distinct from excluded.last_point_time_sec
        or token_sparklines_latest.sparkline is distinct from excluded.sparkline
        then excluded.updated_at
      else token_sparklines_latest.updated_at
    end;
end;
$$;
