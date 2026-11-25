-- =====================================================================
-- เที่ยวไทย 77 จังหวัด — Migration 013: reviewed place images
-- Runtime pages read approved URLs from Supabase only. They no longer
-- search Wikipedia, Wikidata, or Wikimedia Commons when a page opens.
-- =====================================================================

-- The original schema already contains place_images. CREATE TABLE IF NOT
-- EXISTS keeps this migration usable on a fresh project restored without
-- Migration 001, while the ALTER statements upgrade existing databases.
create table if not exists public.place_images (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid not null references public.places(id) on delete cascade,
  storage_path  text,
  external_url  text check (external_url is null or external_url ~* '^https://'),
  license       text not null,
  author        text,
  source_url    text,
  alt_th        text,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint place_images_has_file check (storage_path is not null or external_url is not null)
);

alter table public.place_images
  add column if not exists review_status text not null default 'approved',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text;

-- Existing rows were created by the Admin image workflow, which already
-- requires author, license, source URL, and a valid image URL. Preserve them.
update public.place_images
set review_status = 'approved',
    reviewed_at = coalesce(reviewed_at, created_at)
where review_status = 'approved'
  and reviewed_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'place_images_review_status_check'
      and conrelid = 'public.place_images'::regclass
  ) then
    alter table public.place_images
      add constraint place_images_review_status_check
      check (review_status in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'place_images_approved_metadata_check'
      and conrelid = 'public.place_images'::regclass
  ) then
    alter table public.place_images
      add constraint place_images_approved_metadata_check
      check (
        review_status <> 'approved'
        or (
          nullif(btrim(license), '') is not null
          and (
            storage_path is not null
            or (
              external_url ~* '^https://(upload|thumb)\.wikimedia\.org/'
              and source_url ~* '^https://commons\.wikimedia\.org/wiki/File:'
            )
          )
        )
      ) not valid;
  end if;
end $$;

create index if not exists place_images_place_review_idx
  on public.place_images(place_id, review_status, sort_order);

create unique index if not exists place_images_place_external_uq
  on public.place_images(place_id, external_url)
  where external_url is not null;

alter table public.place_images enable row level security;

-- Anonymous visitors can only read rows an Admin has approved. The existing
-- admin-write policy remains in place and also lets Admins inspect pending rows.
drop policy if exists place_images_read_all on public.place_images;
drop policy if exists place_images_read_approved on public.place_images;
create policy place_images_read_approved on public.place_images
  for select using (review_status = 'approved');

-- ---------------------------------------------------------------------
-- Starter rows reviewed on 2026-11-25 against their Wikimedia Commons
-- File pages. ON CONFLICT makes the migration safe to re-run.
-- ---------------------------------------------------------------------
with reviewed(
  province_slug, place_name_th, external_url, license, author,
  source_url, alt_th, sort_order, reviewed_at, review_note
) as (
  values
    (
      'chon-buri',
      'สวนนงนุชพัทยา',
      'https://upload.wikimedia.org/wikipedia/commons/7/7f/Nong_Noogh_Garden%281%29.jpg',
      'Public domain',
      'Kimmam at English Wikipedia',
      'https://commons.wikimedia.org/wiki/File:Nong_Noogh_Garden(1).jpg',
      'สวนฝรั่งเศสภายในสวนนงนุชพัทยา',
      0::smallint,
      '2026-11-25T19:39:23+07:00'::timestamptz,
      'ตรวจชื่อสถานที่ ผู้สร้าง และสถานะ Public domain จาก Commons File page'
    ),
    (
      'chon-buri',
      'หาดบางแสน',
      'https://upload.wikimedia.org/wikipedia/commons/e/e9/Bang_Saen_01.JPG',
      'CC BY-SA 3.0',
      'atreyu (Mstp77)',
      'https://commons.wikimedia.org/wiki/File:Bang_Saen_01.JPG',
      'หาดบางแสน จังหวัดชลบุรี',
      0::smallint,
      '2026-11-25T19:39:23+07:00'::timestamptz,
      'ตรวจคำอธิบาย Bang Saen, Chonburi, Thailand ผู้สร้าง และใบอนุญาตจาก Commons File page'
    ),
    (
      'chon-buri',
      'หาดจอมเทียน',
      'https://upload.wikimedia.org/wikipedia/commons/8/8b/Jomtien_Beach_%287%29.jpg',
      'CC BY-SA 4.0',
      'Георгий Долгопский',
      'https://commons.wikimedia.org/wiki/File:Jomtien_Beach_(7).jpg',
      'หาดจอมเทียน จังหวัดชลบุรี',
      0::smallint,
      '2026-11-25T19:39:23+07:00'::timestamptz,
      'ตรวจชื่อภาพ ผู้สร้าง และใบอนุญาตจาก Commons File page'
    )
), resolved as (
  select p.id as place_id, r.*
  from reviewed r
  join public.provinces pv on pv.slug = r.province_slug
  join public.places p on p.province_id = pv.id and p.name_th = r.place_name_th
), upserted as (
  insert into public.place_images(
    place_id, storage_path, external_url, license, author, source_url,
    alt_th, sort_order, review_status, reviewed_at, review_note
  )
  select
    place_id, null, external_url, license, author, source_url,
    alt_th, sort_order, 'approved', reviewed_at, review_note
  from resolved
  on conflict (place_id, external_url) where external_url is not null
  do update set
    license = excluded.license,
    author = excluded.author,
    source_url = excluded.source_url,
    alt_th = excluded.alt_th,
    sort_order = excluded.sort_order,
    review_status = 'approved',
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id, place_id
)
update public.places p
set cover_image_id = u.id,
    updated_at = now()
from upserted u
where p.id = u.place_id
  and p.cover_image_id is null;
