-- =====================================================================
-- Migration 007: Admin review of user-submitted places WITHOUT exposing
-- the owner's private notes. Admin no longer reads user_places directly;
-- review goes through SECURITY DEFINER functions that return only public fields.
-- =====================================================================
drop policy if exists user_places_admin_review on public.user_places;
drop policy if exists user_places_admin_decide on public.user_places;

create or replace function public.admin_list_submissions()
returns table (
  id uuid, owner_name text, name_th text, name_en text, province_id uuid, district_id uuid, category_id uuid,
  short_description text, lat numeric, lng numeric, address text, suggested_minutes smallint,
  est_cost_per_person numeric, google_maps_url text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return query
    select u.id, p.display_name, u.name_th, u.name_en, u.province_id, u.district_id, u.category_id,
           u.short_description, u.lat, u.lng, u.address, u.suggested_minutes, u.est_cost_per_person,
           u.google_maps_url, u.created_at
    from public.user_places u left join public.profiles p on p.id = u.owner_id
    where u.submission = 'submitted'
    order by u.created_at;
end $$;

create or replace function public.admin_decide_submission(p_id uuid, p_status public.submission_status, p_place uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid status'; end if;
  update public.user_places
     set submission = p_status,
         promoted_place_id = case when p_status = 'approved' then p_place else promoted_place_id end
   where id = p_id and submission = 'submitted';
  if not found then raise exception 'submission not found'; end if;
end $$;

revoke all on function public.admin_list_submissions() from public, anon;
revoke all on function public.admin_decide_submission(uuid, public.submission_status, uuid) from public, anon;
grant execute on function public.admin_list_submissions() to authenticated;
grant execute on function public.admin_decide_submission(uuid, public.submission_status, uuid) to authenticated;
