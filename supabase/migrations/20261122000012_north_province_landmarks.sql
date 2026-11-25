-- =====================================================================
-- Migration 012: Province Landmark workflow (Northern pilot)
-- Run after 20261121000011_budget_auto_replace_atomic.sql.
--
-- Safe properties:
--   * idempotent and non-destructive; no existing place/user row is deleted
--   * province_landmarks is separate from candidate approval and province badges
--   * public reads only published landmarks whose place is still published
--   * every link import is forced to pending/unpublished
--   * unreviewed image metadata stays in the existing place_images table but is
--     hidden by RLS and never assigned to places.cover_image_id
-- =====================================================================

create table if not exists public.province_landmarks (
  id                  uuid primary key default gen_random_uuid(),
  province_id         uuid not null references public.provinces(id) on delete cascade,
  place_id            uuid not null unique references public.places(id) on delete cascade,
  place_key           text not null unique,
  landmark_rank                smallint not null check (landmark_rank between 1 and 3),
  landmark_reason_th  text not null check (char_length(trim(landmark_reason_th)) between 1 and 1000),
  status              text not null default 'pending'
                      check (status in ('draft','pending','published','rejected')),
  is_published        boolean not null default false,
  admin_note          text,
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  published_by        uuid references auth.users(id) on delete set null,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint province_landmarks_publish_state_ck
    check ((status = 'published') = is_published)
);

create unique index if not exists province_landmarks_active_rank_uq
  on public.province_landmarks(province_id, landmark_rank)
  where status <> 'rejected';
create index if not exists province_landmarks_public_idx
  on public.province_landmarks(province_id, landmark_rank)
  where status = 'published' and is_published;

drop trigger if exists province_landmarks_updated_at on public.province_landmarks;
create trigger province_landmarks_updated_at before update on public.province_landmarks
  for each row execute function public.set_updated_at();

-- Enforce province consistency and the publish guard even when an Admin writes
-- directly through the Table Editor instead of using the RPC.
create or replace function public.guard_province_landmark_row()
returns trigger language plpgsql set search_path = public as $$
declare
  v_province uuid;
  v_verification public.verification_status;
  v_place_published boolean;
begin
  select province_id, verification, is_published
    into v_province, v_verification, v_place_published
    from public.places where id = new.place_id;
  if v_province is null then raise exception 'place not found'; end if;
  if new.province_id <> v_province then raise exception 'place/province mismatch'; end if;
  if new.status = 'published' or new.is_published then
    if v_verification <> 'verified' or not v_place_published then
      raise exception 'place must be verified and published first';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_province_landmark_row on public.province_landmarks;
create trigger trg_guard_province_landmark_row
  before insert or update of province_id, place_id, status, is_published
  on public.province_landmarks for each row execute function public.guard_province_landmark_row();

-- Reuse place_images. Existing image rows are treated as approved so this
-- migration does not hide or break any current cover. Link-import candidates
-- explicitly use a non-approved image_status and cover_mode=auto_fallback.
alter table public.place_images add column if not exists review_key text;
alter table public.place_images add column if not exists image_status text not null default 'approved';
alter table public.place_images add column if not exists cover_mode text not null default 'actual';
alter table public.place_images add column if not exists license_url text;
alter table public.place_images add column if not exists attribution_text text;
alter table public.place_images add column if not exists width_px integer;
alter table public.place_images add column if not exists height_px integer;
alter table public.place_images add column if not exists sharealike_required boolean;
alter table public.place_images add column if not exists modifications text;
alter table public.place_images add column if not exists review_note text;
alter table public.place_images add column if not exists temporary_cover_label text;

create unique index if not exists place_images_review_key_uq
  on public.place_images(review_key) where review_key is not null;
create index if not exists place_images_approved_place_idx
  on public.place_images(place_id, sort_order) where image_status = 'approved';

do $$ begin
  alter table public.place_images add constraint place_images_image_status_ck
    check (image_status in ('approved','license_verified_visual_pending','missing','rejected_as_cover'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.place_images add constraint place_images_cover_mode_ck
    check (cover_mode in ('actual','auto_fallback'));
exception when duplicate_object then null; end $$;

-- Pending/missing metadata may have no file. Only approved images must have a
-- real storage path or external URL.
alter table public.place_images drop constraint if exists place_images_has_file;
alter table public.place_images add constraint place_images_has_file
  check (image_status <> 'approved' or storage_path is not null or external_url is not null);

alter table public.province_landmarks enable row level security;

drop policy if exists province_landmarks_public_read on public.province_landmarks;
create policy province_landmarks_public_read on public.province_landmarks for select
  using (
    (status = 'published' and is_published and exists (
      select 1 from public.places p
      where p.id = province_landmarks.place_id and p.is_published
    )) or public.is_admin()
  );

drop policy if exists province_landmarks_admin_write on public.province_landmarks;
create policy province_landmarks_admin_write on public.province_landmarks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.province_landmarks to anon, authenticated;
grant insert, update, delete on public.province_landmarks to authenticated;

-- Replace the former read-all image policy: pending candidate metadata is
-- Admin-only. Existing approved images remain public for published places.
drop policy if exists place_images_read_all on public.place_images;
drop policy if exists place_images_public_approved on public.place_images;
create policy place_images_public_approved on public.place_images for select
  using (
    public.is_admin() or (
      image_status = 'approved' and exists (
        select 1 from public.places p
        where p.id = place_images.place_id and p.is_published
      )
    )
  );

-- Link one real place to one pending Landmark bundle. This function never
-- creates a place, never fabricates a UUID, never publishes, and never changes
-- an existing place row. Sources and image metadata are attached idempotently.
create or replace function public.admin_link_province_landmark(
  p_place uuid,
  p_province_pcode text,
  p_place_key text,
  p_rank smallint,
  p_reason text,
  p_sources jsonb default '[]'::jsonb,
  p_image jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_province uuid;
  v_place_province uuid;
  v_landmark uuid;
  v_source jsonb;
  v_source_id uuid;
  v_checked date;
  v_image_status text;
  v_external_url text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_place is null then raise exception 'real place_id is required'; end if;
  if p_rank not between 1 and 3 then raise exception 'landmark_rank must be 1..3'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'landmark reason is required'; end if;
  if nullif(trim(p_place_key), '') is null then raise exception 'place_key is required'; end if;

  select id into v_province from public.provinces
   where lower(pcode) in (lower(trim(p_province_pcode)), lower('TH' || trim(p_province_pcode)))
   limit 1;
  if v_province is null then raise exception 'province not found'; end if;

  select province_id into v_place_province from public.places where id = p_place;
  if v_place_province is null then raise exception 'place not found'; end if;
  if v_place_province <> v_province then raise exception 'place/province mismatch'; end if;

  insert into public.province_landmarks(
    province_id, place_id, place_key, landmark_rank, landmark_reason_th,
    status, is_published, reviewed_by, reviewed_at
  ) values (
    v_province, p_place, trim(p_place_key), p_rank, trim(p_reason),
    'pending', false, auth.uid(), now()
  )
  on conflict (place_id) do update set
    province_id = excluded.province_id,
    place_key = excluded.place_key,
    landmark_rank = excluded.landmark_rank,
    landmark_reason_th = excluded.landmark_reason_th,
    status = 'pending',
    is_published = false,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    published_by = null,
    published_at = null
  returning id into v_landmark;

  for v_source in select value from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) loop
    if coalesce(v_source->>'source_url', '') !~* '^https?://' then
      raise exception 'invalid source_url';
    end if;
    begin
      v_checked := nullif(v_source->>'checked_at', '')::date;
    exception when others then
      raise exception 'invalid source checked_at';
    end;
    if v_checked is null then v_checked := current_date; end if;

    select id into v_source_id from public.place_sources
      where place_id = p_place and source_url = v_source->>'source_url' limit 1;
    if v_source_id is null then
      insert into public.place_sources(
        place_id, source_url, source_name, source_type, fields, checked_at, note
      ) values (
        p_place,
        v_source->>'source_url',
        nullif(v_source->>'source_name', ''),
        case when v_source->>'source_type' in ('tat','province','national_park','local_gov','official_social','osm','other')
          then v_source->>'source_type' else 'other' end,
        array[]::text[],
        v_checked,
        nullif(v_source->>'note', '')
      );
    else
      update public.place_sources set
        source_name = coalesce(nullif(v_source->>'source_name', ''), source_name),
        source_type = case when v_source->>'source_type' in ('tat','province','national_park','local_gov','official_social','osm','other')
          then v_source->>'source_type' else source_type end,
        checked_at = coalesce(v_checked, checked_at),
        note = coalesce(nullif(v_source->>'note', ''), note)
      where id = v_source_id;
    end if;
    v_source_id := null;
  end loop;

  if p_image is not null then
    v_image_status := coalesce(nullif(p_image->>'image_status', ''), 'missing');
    if v_image_status not in ('license_verified_visual_pending','missing','rejected_as_cover') then
      raise exception 'link import cannot approve an image';
    end if;
    v_external_url := nullif(p_image->>'image_url', '');
    if v_external_url is not null and v_external_url !~* '^https://upload\.wikimedia\.org/' then
      raise exception 'unreviewed external image must be a Wikimedia upload URL';
    end if;

    insert into public.place_images(
      place_id, review_key, storage_path, external_url, license, author, source_url, alt_th, sort_order,
      image_status, cover_mode, license_url, attribution_text, width_px, height_px,
      sharealike_required, modifications, review_note, temporary_cover_label
    ) values (
      p_place, trim(p_place_key) || ':cover:1', null, v_external_url,
      coalesce(nullif(p_image->>'license_code', ''), 'pending review'),
      nullif(p_image->>'author', ''), nullif(p_image->>'commons_page_url', ''), nullif(p_image->>'alt_text_th', ''), 0,
      v_image_status, 'auto_fallback', nullif(p_image->>'license_url', ''), nullif(p_image->>'attribution_text', ''),
      nullif(p_image->>'width_px', '')::integer, nullif(p_image->>'height_px', '')::integer,
      case when p_image ? 'sharealike_required' then (p_image->>'sharealike_required')::boolean else null end,
      nullif(p_image->>'modifications', ''), nullif(p_image->>'review_note', ''),
      coalesce(nullif(p_image->>'temporary_cover_label', ''), 'ภาพประกอบ')
    )
    on conflict (review_key) do update set
      place_id = excluded.place_id,
      external_url = coalesce(excluded.external_url, place_images.external_url),
      license = coalesce(nullif(excluded.license, ''), place_images.license),
      author = coalesce(excluded.author, place_images.author),
      source_url = coalesce(excluded.source_url, place_images.source_url),
      alt_th = coalesce(excluded.alt_th, place_images.alt_th),
      image_status = excluded.image_status,
      cover_mode = 'auto_fallback',
      license_url = coalesce(excluded.license_url, place_images.license_url),
      attribution_text = coalesce(excluded.attribution_text, place_images.attribution_text),
      width_px = coalesce(excluded.width_px, place_images.width_px),
      height_px = coalesce(excluded.height_px, place_images.height_px),
      sharealike_required = coalesce(excluded.sharealike_required, place_images.sharealike_required),
      modifications = coalesce(excluded.modifications, place_images.modifications),
      review_note = coalesce(excluded.review_note, place_images.review_note),
      temporary_cover_label = 'ภาพประกอบ';
  end if;

  return v_landmark;
end $$;

-- Candidate review is deliberately not publication. This function can only
-- keep a row pending or reject it; both states are private.
create or replace function public.admin_review_province_landmark(
  p_id uuid, p_rank smallint, p_reason text, p_status text, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_rank not between 1 and 3 then raise exception 'landmark_rank must be 1..3'; end if;
  if p_status not in ('pending','rejected') then raise exception 'review is not publication'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'landmark reason is required'; end if;
  update public.province_landmarks set
    landmark_rank = p_rank,
    landmark_reason_th = trim(p_reason),
    status = p_status,
    is_published = false,
    admin_note = coalesce(nullif(p_note, ''), admin_note),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    published_by = null,
    published_at = null
  where id = p_id;
  if not found then raise exception 'landmark not found'; end if;
end $$;

create or replace function public.admin_publish_province_landmark(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_place uuid; v_verified public.verification_status; v_place_published boolean;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select l.place_id, p.verification, p.is_published
    into v_place, v_verified, v_place_published
    from public.province_landmarks l join public.places p on p.id = l.place_id
   where l.id = p_id and l.status <> 'rejected';
  if v_place is null then raise exception 'landmark not found'; end if;
  if v_verified <> 'verified' or not v_place_published then
    raise exception 'place must be verified and published first';
  end if;
  update public.province_landmarks set
    status = 'published', is_published = true,
    published_by = auth.uid(), published_at = now()
  where id = p_id;
end $$;

create or replace function public.admin_unpublish_province_landmark(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.province_landmarks set
    status = 'pending', is_published = false,
    published_by = null, published_at = null
  where id = p_id;
  if not found then raise exception 'landmark not found'; end if;
end $$;

-- A published Landmark cannot outlive the place's verification/publication.
create or replace function public.unpublish_landmark_when_place_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_published = false or new.verification <> 'verified' then
    update public.province_landmarks set
      status = case when status = 'published' then 'pending' else status end,
      is_published = false,
      published_by = null,
      published_at = null
    where place_id = new.id and is_published;
  end if;
  return new;
end $$;

drop trigger if exists trg_unpublish_landmark_when_place_private on public.places;
create trigger trg_unpublish_landmark_when_place_private
  after update of is_published, verification on public.places
  for each row execute function public.unpublish_landmark_when_place_private();

revoke all on function public.admin_link_province_landmark(uuid,text,text,smallint,text,jsonb,jsonb) from public, anon;
revoke all on function public.admin_review_province_landmark(uuid,smallint,text,text,text) from public, anon;
revoke all on function public.admin_publish_province_landmark(uuid) from public, anon;
revoke all on function public.admin_unpublish_province_landmark(uuid) from public, anon;
grant execute on function public.admin_link_province_landmark(uuid,text,text,smallint,text,jsonb,jsonb) to authenticated;
grant execute on function public.admin_review_province_landmark(uuid,smallint,text,text,text) to authenticated;
grant execute on function public.admin_publish_province_landmark(uuid) to authenticated;
grant execute on function public.admin_unpublish_province_landmark(uuid) to authenticated;

comment on table public.province_landmarks is
  'Admin-managed Landmark ranking. Candidate review does not publish; public rows require explicit publish and a verified published place.';
comment on column public.place_images.review_key is
  'Idempotent key for unreviewed image metadata stored in the existing place_images table; never use as cover until image_status=approved.';
