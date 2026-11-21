-- =====================================================================
-- เที่ยวไทย 77 จังหวัด — Migration 002: Row Level Security
-- Principle:
--   * Reference/catalog data  -> everyone can read, only admin can write
--   * Personal data           -> only owner (user_id = auth.uid())
--   * Trip data               -> trip members read, owner/editor write
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER avoids RLS recursion)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_trip_member(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip and user_id = auth.uid());
$$;

create or replace function public.can_edit_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members
                 where trip_id = p_trip and user_id = auth.uid() and role in ('owner','editor'));
$$;

create or replace function public.is_trip_owner(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips where id = p_trip and owner_id = auth.uid());
$$;

-- Personal place is visible to co-members if it is used in a shared trip
create or replace function public.user_place_visible_via_trip(p_user_place uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_items ti
    join public.trip_members tm on tm.trip_id = ti.trip_id
    where ti.user_place_id = p_user_place and tm.user_id = auth.uid());
$$;

-- Prevent non-admins from changing role (SQL editor / service role has auth.uid() = null)
create or replace function public.guard_profile_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'permission denied: cannot change role';
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Invite partner to a trip by e-mail (owner only)
create or replace function public.invite_trip_member(p_trip uuid, p_email text, p_role public.trip_member_role default 'editor')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_id uuid;
begin
  if not public.is_trip_owner(p_trip) then raise exception 'only trip owner can invite'; end if;
  if p_role = 'owner' then raise exception 'cannot assign owner'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'ไม่พบผู้ใช้อีเมลนี้'; end if;
  insert into public.trip_members (trip_id, user_id, role) values (p_trip, v_user, p_role)
  on conflict (trip_id, user_id) do update set role = excluded.role
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.invite_trip_member(uuid, text, public.trip_member_role) from public, anon;
grant execute on function public.invite_trip_member(uuid, text, public.trip_member_role) to authenticated;

-- ---------------------------------------------------------------------
-- Enable RLS on all public tables
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Reference & catalog: public read, admin write
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['regions','provinces','districts','subdistricts','categories','tags',
                           'place_sources','place_images','place_facilities','place_tags',
                           'budget_categories','app_settings']
  loop
    execute format('create policy %I on public.%I for select using (true)', t || '_read_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t || '_admin_write', t);
  end loop;
end $$;

-- places: unpublished rows visible to admin only
create policy places_read on public.places for select
  using (is_published or public.is_admin());
create policy places_admin_write on public.places for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- profiles & settings
-- ---------------------------------------------------------------------
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin()
         or exists (select 1 from public.trip_members a join public.trip_members b on a.trip_id = b.trip_id
                    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy user_settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Simple owner-only tables
-- ---------------------------------------------------------------------
create policy user_place_status_own on public.user_place_status for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy travel_memories_own on public.travel_memories for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy memory_photos_own on public.memory_photos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- import_logs: own logs; admin sees all; insert own only
create policy import_logs_read on public.import_logs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy import_logs_insert on public.import_logs for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- user_places: owner full; admin reads submitted; co-members read used ones
-- ---------------------------------------------------------------------
create policy user_places_owner on public.user_places for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy user_places_admin_review on public.user_places for select to authenticated
  using (public.is_admin() and submission in ('submitted','approved','rejected'));
create policy user_places_admin_decide on public.user_places for update to authenticated
  using (public.is_admin() and submission <> 'private')
  with check (public.is_admin() and submission <> 'private');
create policy user_places_via_trip on public.user_places for select to authenticated
  using (public.user_place_visible_via_trip(id));

-- ---------------------------------------------------------------------
-- visited_places: owner full; co-members read when shared to a trip
-- ---------------------------------------------------------------------
create policy visited_own on public.visited_places for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy visited_shared_trip on public.visited_places for select to authenticated
  using (share_with_trip and trip_id is not null and public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------
-- Trips & children
-- ---------------------------------------------------------------------
-- owner_id check lets insert(...).select() work before the member trigger row is visible
create policy trips_read   on public.trips for select to authenticated
  using (owner_id = auth.uid() or public.is_trip_member(id));
create policy trips_insert on public.trips for insert to authenticated with check (owner_id = auth.uid());
create policy trips_update on public.trips for update to authenticated
  using (public.can_edit_trip(id))
  with check (public.can_edit_trip(id));
create policy trips_delete on public.trips for delete to authenticated using (owner_id = auth.uid());

-- owner_id cannot be changed by editors
create or replace function public.guard_trip_owner()
returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then raise exception 'cannot change trip owner'; end if;
  return new;
end $$;
create trigger trips_guard_owner before update on public.trips
  for each row execute function public.guard_trip_owner();

create policy trip_members_read on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));
create policy trip_members_owner_manage on public.trip_members for all to authenticated
  using (public.is_trip_owner(trip_id) and role <> 'owner')
  with check (public.is_trip_owner(trip_id) and role <> 'owner');
create policy trip_members_leave on public.trip_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');

do $$
declare t text;
begin
  foreach t in array array['trip_days','trip_items','trip_routes','accommodations','budget_items'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_trip_member(trip_id))',
                   t || '_member_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_trip(trip_id))',
                   t || '_editor_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id))',
                   t || '_editor_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_trip(trip_id))',
                   t || '_editor_delete', t);
  end loop;
end $$;

-- Guests (anon) get read-only catalog via the *_read_all policies above.
