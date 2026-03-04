drop policy if exists feed_snapshots_deny_client_read on public.feed_snapshots;
create policy feed_snapshots_deny_client_read on public.feed_snapshots for select to anon, authenticated using (false);

drop policy if exists feed_snapshot_items_deny_client_read on public.feed_snapshot_items;
create policy feed_snapshot_items_deny_client_read on public.feed_snapshot_items for select to anon, authenticated using (false);
