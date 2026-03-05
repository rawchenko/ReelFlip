-- Preserve the hardened view-only client read surface from Stage 2.
-- security_invoker must remain false because anon/authenticated no longer have
-- direct SELECT access on the underlying token-domain tables.

alter view public.v_token_feed
set (
  security_invoker = false,
  security_barrier = true
);
