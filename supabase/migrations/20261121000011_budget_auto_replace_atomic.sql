-- =====================================================================
-- Migration 011: atomically replace budget estimates generated from plan
--
-- DELETE and INSERT execute inside one PostgreSQL function call/transaction.
-- Any validation, RLS, FK, CHECK, or INSERT failure rolls the DELETE back.
-- Existing manual rows are never targeted. Existing budget RLS is unchanged.
-- =====================================================================

create or replace function public.replace_budget_auto_items(
  p_trip_id uuid,
  p_rows jsonb default '[]'::jsonb
)
returns setof public.budget_items
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_row jsonb;
begin
  if p_trip_id is null then
    raise exception using errcode = '22023', message = 'trip id is required';
  end if;

  if auth.uid() is null or not coalesce(public.can_edit_trip(p_trip_id), false) then
    raise exception using errcode = '42501', message = 'not allowed to edit this trip';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'p_rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) > 2000 then
    raise exception using errcode = '22023', message = 'too many automatic budget rows';
  end if;

  -- Validate the complete payload before touching existing rows. Database
  -- constraints remain the final authority and also roll the transaction back.
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object'
      or nullif(v_row->>'category_id', '') is null
      or nullif(btrim(v_row->>'label'), '') is null
      or char_length(v_row->>'label') > 200
      or jsonb_typeof(v_row->'estimated') <> 'number'
      or not (v_row->>'estimated' ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$')
      or (v_row->>'estimated')::numeric < 0
      or (v_row->>'estimated')::numeric >= 10000000
    then
      raise exception using errcode = '22023', message = 'invalid automatic budget row';
    end if;

    -- Force UUID validation before DELETE. Missing/null optional ids are allowed.
    perform (v_row->>'category_id')::uuid;
    if nullif(v_row->>'day_id', '') is not null then
      perform (v_row->>'day_id')::uuid;
    end if;
    if nullif(v_row->>'trip_item_id', '') is not null then
      perform (v_row->>'trip_item_id')::uuid;
    end if;
  end loop;

  -- Serialize plan recalculation for the same trip. A different trip can still
  -- recalculate concurrently. Manual edit/delete APIs keep their own checks.
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('budget-auto:' || p_trip_id::text, 0)
  );

  delete from public.budget_items
  where trip_id = p_trip_id
    and is_auto = true;

  return query
  insert into public.budget_items as inserted (
    trip_id,
    category_id,
    day_id,
    trip_item_id,
    label,
    estimated,
    actual,
    is_shared,
    paid_by,
    is_auto,
    spent_at,
    notes,
    created_by
  )
  select
    p_trip_id,
    (row_data->>'category_id')::uuid,
    nullif(row_data->>'day_id', '')::uuid,
    nullif(row_data->>'trip_item_id', '')::uuid,
    row_data->>'label',
    (row_data->>'estimated')::numeric,
    null,
    true,
    null,
    true,
    null,
    null,
    auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as source(row_data, row_number)
  order by row_number
  returning inserted.*;
end;
$function$;

comment on function public.replace_budget_auto_items(uuid, jsonb) is
  'Atomically replaces one trip''s auto budget rows; security-invoker and protected by existing can_edit_trip/RLS rules.';

revoke all on function public.replace_budget_auto_items(uuid, jsonb) from public;
revoke all on function public.replace_budget_auto_items(uuid, jsonb) from anon;
grant execute on function public.replace_budget_auto_items(uuid, jsonb) to authenticated;
