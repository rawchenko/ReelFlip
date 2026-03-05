# Stage 2 Rollback Playbook (Operational)

This rollback is operational only. Do not run schema down migrations.

## Trigger Conditions
- Supabase query failures spike after Stage 2 cutover.
- `v_token_feed` compatibility shape breaks API responses.
- Storage-layer writes fail due unexpected constraint violations.
- p95 or parity checks fail hard during migration verification.

## Immediate Rollback Actions
1. Disable Supabase read-through:
```bash
SUPABASE_READ_ENABLED=false
```
2. Disable Supabase dual-write:
```bash
SUPABASE_DUAL_WRITE_ENABLED=false
```
3. Keep provider/cache read path active.
4. Restart backend with rollback flags.

## Emergency SQL Hotfix (Temporary)
Use only if clients must temporarily recover direct table reads while investigating.

```sql
grant select on public.tokens to anon, authenticated;
grant select on public.token_pairs to anon, authenticated;
grant select on public.token_market_latest to anon, authenticated;
grant select on public.token_labels_latest to anon, authenticated;
grant select on public.token_sparklines_latest to anon, authenticated;
grant select on public.token_candles_1m to anon, authenticated;

drop policy if exists token_public_read on public.tokens;
create policy token_public_read on public.tokens for select to anon, authenticated using (true);
drop policy if exists token_pairs_public_read on public.token_pairs;
create policy token_pairs_public_read on public.token_pairs for select to anon, authenticated using (true);
drop policy if exists token_market_public_read on public.token_market_latest;
create policy token_market_public_read on public.token_market_latest for select to anon, authenticated using (true);
drop policy if exists token_labels_public_read on public.token_labels_latest;
create policy token_labels_public_read on public.token_labels_latest for select to anon, authenticated using (true);
drop policy if exists token_sparklines_public_read on public.token_sparklines_latest;
create policy token_sparklines_public_read on public.token_sparklines_latest for select to anon, authenticated using (true);
drop policy if exists token_candles_public_read on public.token_candles_1m;
create policy token_candles_public_read on public.token_candles_1m for select to anon, authenticated using (true);
```

After incident mitigation, re-apply the hardening migration to restore view-only access.

## Validation After Rollback
1. Check health endpoint:
```bash
curl -sS http://127.0.0.1:3001/health
```
2. Smoke-test feed endpoint:
```bash
curl -sS "http://127.0.0.1:3001/v1/feed?limit=5"
```
3. Confirm error-rate/latency recovery in `/metrics`.

## Recovery and Re-enable Procedure
1. Triage failure root cause from backend logs + Supabase logs.
2. Run:
- `stage2_schema_checks.sql`
- `performance_checks.sql`
- backend parity/perf commands
3. Re-enable dual-write first:
```bash
SUPABASE_DUAL_WRITE_ENABLED=true
```
4. Re-enable read-through after successful verification:
```bash
SUPABASE_READ_ENABLED=true
```

## Notes
- Stage 2 migrations are forward-only; rollback is by feature flags.
- Keep this playbook aligned with rollout gates in `rollout_gates.md`.
