create table if not exists public.user_watchlists (
  wallet text not null,
  mint text not null references public.tokens(mint) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (wallet, mint)
);

create index if not exists idx_user_watchlists_wallet_added_at_desc
  on public.user_watchlists(wallet, added_at desc);

alter table public.user_watchlists enable row level security;

drop policy if exists user_watchlists_deny_client_read on public.user_watchlists;
create policy user_watchlists_deny_client_read
  on public.user_watchlists
  for select
  to anon, authenticated
  using (false);

drop policy if exists user_watchlists_deny_client_insert on public.user_watchlists;
create policy user_watchlists_deny_client_insert
  on public.user_watchlists
  for insert
  to anon, authenticated
  with check (false);

drop policy if exists user_watchlists_deny_client_update on public.user_watchlists;
create policy user_watchlists_deny_client_update
  on public.user_watchlists
  for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists user_watchlists_deny_client_delete on public.user_watchlists;
create policy user_watchlists_deny_client_delete
  on public.user_watchlists
  for delete
  to anon, authenticated
  using (false);
