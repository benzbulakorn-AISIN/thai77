-- =====================================================================
-- Migration 006: Budget Planner
--  * trips.meal_cost_pp  : estimated cost per person per meal (editable, used for auto estimates)
--  * budget_items.trip_item_id unique-ish lookups + index for day summaries
-- =====================================================================
alter table public.trips
  add column if not exists meal_cost_pp numeric(10,2) not null default 150 check (meal_cost_pp >= 0);

create index if not exists budget_items_day_idx on public.budget_items(trip_id, day_id);
create index if not exists budget_items_trip_item_idx on public.budget_items(trip_item_id);
