-- =====================================================================
-- Migration 012: Landmark workflow for all 77 provinces
-- Compatible extension of the existing Thai77 schema; no existing rows
-- or user history are deleted. Run after migrations 001-010.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Extend existing catalog tables without replacing them
-- ---------------------------------------------------------------------
alter table public.places add column if not exists place_key text;
alter table public.places add column if not exists region_name_th text;
alter table public.places add column if not exists landmark_rank smallint;
alter table public.places add column if not exists landmark_category text;
alter table public.places add column if not exists landmark_reason_th text;
alter table public.places add column if not exists is_landmark boolean not null default false;
alter table public.places add column if not exists landmark_status text not null default 'draft';
alter table public.places add column if not exists landmark_admin_note text;

create unique index if not exists places_place_key_uq
  on public.places(place_key) where place_key is not null;
create unique index if not exists places_landmark_rank_uq
  on public.places(province_id, landmark_rank)
  where is_landmark and landmark_rank is not null and landmark_status <> 'rejected';
create index if not exists places_landmark_public_idx
  on public.places(province_id, landmark_rank)
  where is_landmark and is_published;

do $$ begin
  alter table public.places add constraint places_landmark_rank_ck
    check (landmark_rank is null or landmark_rank between 1 and 3);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.places add constraint places_landmark_status_ck
    check (landmark_status in ('draft','pending','published','rejected'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.places add constraint places_landmark_fields_ck
    check (not is_landmark or (place_key is not null and landmark_rank is not null and landmark_reason_th is not null));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.places add constraint places_landmark_publish_ck
    check (not is_landmark or not is_published or (verification = 'verified' and landmark_status = 'published'));
exception when duplicate_object then null; end $$;

-- Keep the legacy Admin editor safe: a Landmark can become public only after
-- Admin has marked it verified; publishing automatically synchronizes status.
create or replace function public.sync_landmark_publish_state()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_landmark then
    if new.verification <> 'verified' then
      new.is_published := false;
      if new.landmark_status = 'published' then new.landmark_status := 'pending'; end if;
    elsif new.is_published then
      new.landmark_status := 'published';
      if new.verified_at is null then new.verified_at := current_date; end if;
    elsif new.landmark_status = 'published' then
      new.landmark_status := 'pending';
    elsif new.landmark_status = 'draft' and tg_op = 'UPDATE' then
      if old.verification is distinct from new.verification then new.landmark_status := 'pending'; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_landmark_publish_state on public.places;
create trigger trg_sync_landmark_publish_state
before insert or update of verification, verified_at, is_published, is_landmark, landmark_status
on public.places for each row execute function public.sync_landmark_publish_state();

alter table public.place_sources add column if not exists source_order smallint;
alter table public.place_sources add column if not exists supports_fields text;
alter table public.place_sources add column if not exists source_verification_status text;
alter table public.place_sources add column if not exists review_note text;
create unique index if not exists place_sources_order_uq
  on public.place_sources(place_id, source_order) where source_order is not null;

-- A review queue is separate from place_images because an unlicensed Commons
-- search result must never satisfy the existing "has_file" constraint.
create table if not exists public.place_image_review_queue (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  image_order smallint not null default 1,
  is_cover boolean not null default true,
  commons_search_url text not null check (commons_search_url ~ '^https://commons\\.wikimedia\\.org/'),
  commons_page_url text,
  file_name text,
  author text,
  license_code text,
  license_url text,
  attribution_text text,
  license_status text not null default 'pending' check (license_status in ('pending','approved','rejected')),
  image_status text not null default 'needs_license_review',
  cover_mode text not null default 'auto_fallback' check (cover_mode in ('actual','auto_fallback')),
  checked_at date not null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(place_id, image_order),
  check (cover_mode = 'auto_fallback' or (commons_page_url is not null and license_status = 'approved'))
);

create table if not exists public.landmark_admin_candidates (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.provinces(id) on delete cascade,
  candidate_order smallint not null check (candidate_order between 1 and 9),
  candidate_name_th text not null,
  recommendation text,
  strengths text,
  limitations text,
  admin_decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(province_id, candidate_order)
);

alter table public.place_image_review_queue enable row level security;
alter table public.landmark_admin_candidates enable row level security;

drop policy if exists place_image_review_queue_admin on public.place_image_review_queue;
create policy place_image_review_queue_admin on public.place_image_review_queue
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists landmark_admin_candidates_admin on public.landmark_admin_candidates;
create policy landmark_admin_candidates_admin on public.landmark_admin_candidates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 2) Immutable province badge ledger
-- ---------------------------------------------------------------------
create table if not exists public.province_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  province_id uuid not null references public.provinces(id) on delete restrict,
  awarded_at timestamptz not null default now(),
  qualifying_place_id uuid not null references public.places(id) on delete restrict,
  qualifying_landmark_rank smallint not null,
  qualifying_landmark_snapshot jsonb not null,
  unique(user_id, province_id)
);
create index if not exists province_badges_user_idx on public.province_badges(user_id, awarded_at desc);
alter table public.province_badges enable row level security;

drop policy if exists province_badges_self_read on public.province_badges;
create policy province_badges_self_read on public.province_badges for select to authenticated
  using (user_id = auth.uid());
drop policy if exists province_badges_admin_read on public.province_badges;
create policy province_badges_admin_read on public.province_badges for select to authenticated
  using (public.is_admin());

-- Only SECURITY DEFINER code can append evidence. There is intentionally no
-- user update/delete policy, so a later Landmark change cannot erase a badge.
create or replace function public.award_landmark_badge(p_user uuid, p_place uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.places; badge_id uuid;
begin
  if p_user is null or p_place is null then return null; end if;
  select * into p from public.places where id = p_place;
  if p.id is null or not (p.is_landmark and p.is_published and p.landmark_status = 'published' and p.verification = 'verified') then
    return null;
  end if;
  insert into public.province_badges(
    user_id, province_id, qualifying_place_id, qualifying_landmark_rank, qualifying_landmark_snapshot
  ) values (
    p_user, p.province_id, p.id, p.landmark_rank,
    jsonb_build_object(
      'place_id', p.id, 'place_key', p.place_key, 'place_name_th', p.name_th,
      'province_id', p.province_id, 'landmark_rank', p.landmark_rank
    )
  ) on conflict (user_id, province_id) do nothing returning id into badge_id;
  if badge_id is null then
    select id into badge_id from public.province_badges where user_id = p_user and province_id = p.province_id;
  end if;
  return badge_id;
end $$;
revoke all on function public.award_landmark_badge(uuid, uuid) from public, anon, authenticated;

create or replace function public.badge_from_place_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.place_id is not null and new.status = 'visited' then
    perform public.award_landmark_badge(new.user_id, new.place_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_badge_from_place_status on public.user_place_status;
create trigger trg_badge_from_place_status
after insert or update of status, place_id on public.user_place_status
for each row execute function public.badge_from_place_status();

create or replace function public.badge_from_visit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.place_id is not null then perform public.award_landmark_badge(new.user_id, new.place_id); end if;
  return new;
end $$;
drop trigger if exists trg_badge_from_visit on public.visited_places;
create trigger trg_badge_from_visit
after insert or update of place_id on public.visited_places
for each row execute function public.badge_from_visit();

-- Backfill awards for existing visits only when the visited place is now a
-- verified published Landmark. Existing awards are never replaced.
insert into public.province_badges(user_id, province_id, qualifying_place_id, qualifying_landmark_rank, qualifying_landmark_snapshot)
select distinct on (v.user_id, p.province_id)
  v.user_id, p.province_id, p.id, p.landmark_rank,
  jsonb_build_object('place_id',p.id,'place_key',p.place_key,'place_name_th',p.name_th,'province_id',p.province_id,'landmark_rank',p.landmark_rank)
from public.visited_places v
join public.places p on p.id = v.place_id
where p.is_landmark and p.is_published and p.landmark_status = 'published' and p.verification = 'verified'
order by v.user_id, p.province_id, v.visited_on
on conflict (user_id, province_id) do nothing;

insert into public.province_badges(user_id, province_id, qualifying_place_id, qualifying_landmark_rank, qualifying_landmark_snapshot)
select distinct on (s.user_id, p.province_id)
  s.user_id, p.province_id, p.id, p.landmark_rank,
  jsonb_build_object('place_id',p.id,'place_key',p.place_key,'place_name_th',p.name_th,'province_id',p.province_id,'landmark_rank',p.landmark_rank)
from public.user_place_status s
join public.places p on p.id = s.place_id
where s.status = 'visited' and p.is_landmark and p.is_published
  and p.landmark_status = 'published' and p.verification = 'verified'
order by s.user_id, p.province_id, s.updated_at
on conflict (user_id, province_id) do nothing;

-- building: no published Landmark
-- never_visited: published Landmark exists, no visit in this province
-- stopped_by: visited another place in the province, not the published Landmark
-- arrived: immutable badge exists
create or replace view public.my_province_landmark_status
with (security_invoker = true) as
with landmark_state as (
  select pr.id province_id,
         bool_or(coalesce(p.is_landmark and p.is_published and p.landmark_status = 'published' and p.verification = 'verified', false)) has_published_landmark
  from public.provinces pr left join public.places p on p.province_id = pr.id
  group by pr.id
), visits as (
  select province_id from public.visited_places
  where user_id = auth.uid() and province_id is not null
  union
  select p.province_id from public.user_place_status s
  join public.places p on p.id = s.place_id
  where s.user_id = auth.uid() and s.status = 'visited'
), badges as (
  select distinct province_id from public.province_badges where user_id = auth.uid()
)
select ls.province_id, ls.has_published_landmark,
  case when not ls.has_published_landmark then 'building'
       when b.province_id is not null then 'arrived'
       when v.province_id is not null then 'stopped_by'
       else 'never_visited' end as province_status
from landmark_state ls
left join visits v using (province_id)
left join badges b using (province_id);

grant select on public.my_province_landmark_status to anon, authenticated;

-- If Admin publishes a Landmark after users had already visited it, award the
-- same immutable badge immediately; they do not need to edit old memories.
create or replace function public.backfill_badges_on_landmark_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_landmark and new.is_published and new.landmark_status = 'published' and new.verification = 'verified'
     and not (old.is_landmark and old.is_published and old.landmark_status = 'published' and old.verification = 'verified') then
    insert into public.province_badges(user_id, province_id, qualifying_place_id, qualifying_landmark_rank, qualifying_landmark_snapshot)
    select users.user_id, new.province_id, new.id, new.landmark_rank,
      jsonb_build_object('place_id',new.id,'place_key',new.place_key,'place_name_th',new.name_th,'province_id',new.province_id,'landmark_rank',new.landmark_rank)
    from (
      select v.user_id from public.visited_places v where v.place_id = new.id
      union
      select s.user_id from public.user_place_status s where s.place_id = new.id and s.status = 'visited'
    ) users
    on conflict (user_id, province_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_backfill_badges_on_landmark_publish on public.places;
create trigger trg_backfill_badges_on_landmark_publish
after update of is_published, verification, landmark_status on public.places
for each row execute function public.backfill_badges_on_landmark_publish();

-- Explicit Admin actions used by the Landmark review screen.
create or replace function public.admin_publish_landmark(p_place uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.places
     set verification = 'verified', verified_at = current_date,
         landmark_status = 'published', is_published = true
   where id = p_place and is_landmark;
  if not found then raise exception 'landmark not found'; end if;
end $$;

create or replace function public.admin_unpublish_landmark(p_place uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.places
     set landmark_status = case when verification = 'verified' then 'pending' else 'draft' end,
         is_published = false
   where id = p_place and is_landmark;
  if not found then raise exception 'landmark not found'; end if;
end $$;

revoke all on function public.admin_publish_landmark(uuid) from public, anon;
revoke all on function public.admin_unpublish_landmark(uuid) from public, anon;
grant execute on function public.admin_publish_landmark(uuid) to authenticated;
grant execute on function public.admin_unpublish_landmark(uuid) to authenticated;
