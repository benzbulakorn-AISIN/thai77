-- Part 8.1c integration test for Migration 011
-- SAFE: every data change is inside BEGIN ... ROLLBACK.
-- Prerequisite: the test database has at least one budget_items row whose
-- created_by user can_edit_trip(trip_id). Run after migration 011.

begin;

do $test$
declare
  v_candidate public.budget_items%rowtype;
  v_can_edit boolean := false;
  v_manual_before bigint;
  v_count bigint;
  v_valid jsonb;
  v_failed_as_expected boolean := false;
begin
  -- Find a real, FK-valid row and impersonate its creator only inside this
  -- transaction. Looping avoids assuming that the first row is editable.
  for v_candidate in
    select *
    from public.budget_items
    where created_by is not null
    order by is_auto desc, created_at
  loop
    perform set_config('request.jwt.claim.sub', v_candidate.created_by::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    v_can_edit := coalesce(public.can_edit_trip(v_candidate.trip_id), false);
    exit when v_can_edit;
  end loop;

  if not v_can_edit then
    raise exception 'PART8_1C TEST SETUP: add one budget row created by an Owner/Editor, then rerun';
  end if;

  select count(*) into v_manual_before
  from public.budget_items
  where trip_id = v_candidate.trip_id and not is_auto;

  v_valid := jsonb_build_array(jsonb_build_object(
    'category_id', v_candidate.category_id,
    'day_id', v_candidate.day_id,
    'trip_item_id', v_candidate.trip_item_id,
    'label', 'part8.1c atomic sentinel',
    'estimated', 125.50
  ));

  -- Valid replacement returns exactly the inserted set and leaves manual rows.
  select count(*) into v_count
  from public.replace_budget_auto_items(v_candidate.trip_id, v_valid);
  if v_count <> 1 then
    raise exception 'valid replacement returned %, expected 1', v_count;
  end if;

  select count(*) into v_count
  from public.budget_items
  where trip_id = v_candidate.trip_id
    and is_auto
    and label = 'part8.1c atomic sentinel'
    and estimated = 125.50;
  if v_count <> 1 then
    raise exception 'valid replacement was not persisted inside test transaction';
  end if;

  select count(*) into v_count
  from public.budget_items
  where trip_id = v_candidate.trip_id and not is_auto;
  if v_count <> v_manual_before then
    raise exception 'manual rows changed: before %, after %', v_manual_before, v_count;
  end if;

  -- This passes all JSON validation, DELETE executes, then the INSERT violates
  -- the category FK. The function statement must roll back to the sentinel set.
  begin
    perform public.replace_budget_auto_items(
      v_candidate.trip_id,
      jsonb_build_array(jsonb_build_object(
        'category_id', '00000000-0000-0000-0000-000000000000',
        'day_id', null,
        'trip_item_id', null,
        'label', 'must never survive',
        'estimated', 1.00
      ))
    );
  exception
    when foreign_key_violation then
      v_failed_as_expected := true;
  end;

  if not v_failed_as_expected then
    raise exception 'invalid replacement did not raise the expected FK failure';
  end if;

  select count(*) into v_count
  from public.budget_items
  where trip_id = v_candidate.trip_id
    and is_auto
    and label = 'part8.1c atomic sentinel'
    and estimated = 125.50;
  if v_count <> 1 then
    raise exception 'ATOMICITY FAILED: old automatic set was not restored after INSERT failure';
  end if;

  -- Empty replacement is valid and atomically clears only automatic rows.
  perform public.replace_budget_auto_items(v_candidate.trip_id, '[]'::jsonb);
  select count(*) into v_count
  from public.budget_items
  where trip_id = v_candidate.trip_id and is_auto;
  if v_count <> 0 then
    raise exception 'empty replacement should leave zero automatic rows, found %', v_count;
  end if;

  select count(*) into v_count
  from public.budget_items
  where trip_id = v_candidate.trip_id and not is_auto;
  if v_count <> v_manual_before then
    raise exception 'empty replacement changed manual rows';
  end if;

  -- Contract checks: SECURITY INVOKER, authenticated-only execution, and lock.
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'replace_budget_auto_items'
      and p.prosecdef
  ) then
    raise exception 'function must remain SECURITY INVOKER';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.replace_budget_auto_items(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role has no EXECUTE grant';
  end if;

  if has_function_privilege(
    'anon',
    'public.replace_budget_auto_items(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anon must not have EXECUTE grant';
  end if;

  if position('pg_advisory_xact_lock' in pg_get_functiondef(
    'public.replace_budget_auto_items(uuid,jsonb)'::regprocedure
  )) = 0 then
    raise exception 'per-trip transaction lock is missing';
  end if;

  raise notice 'PART 8.1c ALL PASSED: valid set, manual preservation, rollback on failed INSERT, empty set, permissions, lock';
end;
$test$;

rollback;
