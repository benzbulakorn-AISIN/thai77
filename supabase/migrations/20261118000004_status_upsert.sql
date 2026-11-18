-- =====================================================================
-- Migration 004: allow upsert on user_place_status / favorites
-- Partial unique indexes cannot be used by ON CONFLICT (PostgREST upsert),
-- so replace them with normal unique constraints. NULLs never conflict in
-- PostgreSQL, so rows for personal places (place_id = null) are unaffected.
-- =====================================================================
drop index if exists public.ups_user_place_uq;
alter table public.user_place_status
  add constraint ups_user_place_key unique (user_id, place_id);

drop index if exists public.fav_user_place_uq;
alter table public.favorites
  add constraint fav_user_place_key unique (user_id, place_id);
