-- =====================================================================
-- Migration 005: mark auto-generated timeline items (meals created by "จัดเส้นทาง")
-- so re-planning can replace them without touching items the user added.
-- =====================================================================
alter table public.trip_items
  add column if not exists is_auto boolean not null default false;
