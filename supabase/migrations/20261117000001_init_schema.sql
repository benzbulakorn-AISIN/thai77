-- =====================================================================
-- เที่ยวไทย 77 จังหวัด — Migration 001: Schema
-- Target: Supabase (PostgreSQL 15+). No PostGIS in MVP.
-- Run order: 001_init_schema -> 002_rls -> 003_storage -> seed.sql
-- =====================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role           as enum ('user', 'admin');
create type public.verification_status as enum ('verified', 'pending', 'outdated', 'demo');
create type public.place_state         as enum ('active', 'seasonal', 'temporarily_closed', 'permanently_closed');
create type public.place_user_status   as enum ('none', 'want', 'planned', 'visited');
create type public.travel_mode         as enum ('car', 'motorcycle', 'walk', 'public_transport');
create type public.trip_member_role    as enum ('owner', 'editor', 'viewer');
create type public.trip_item_type      as enum ('place', 'meal', 'cafe', 'lodging', 'rest_stop', 'custom', 'free_time', 'depart', 'arrive');
create type public.submission_status   as enum ('private', 'submitted', 'approved', 'rejected');

-- ---------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- 1) Users
-- =====================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text check (char_length(display_name) <= 60),
  avatar_path   text,
  role          public.user_role not null default 'user',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.user_settings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  theme                 text not null default 'ocean'
                        check (theme in ('ocean','forest','sunset','sakura','midnight','thai')),
  color_mode            text not null default 'system' check (color_mode in ('light','dark','system')),
  locale                text not null default 'th' check (locale in ('th','en')),
  hidden_category_ids   uuid[] not null default '{}',
  default_mode          public.travel_mode not null default 'car',
  fuel_km_per_l         numeric(5,2) not null default 14 check (fuel_km_per_l > 0),
  fuel_price_per_l      numeric(6,2) not null default 35 check (fuel_price_per_l >= 0),
  road_factor           numeric(3,2) not null default 1.30 check (road_factor between 1 and 3),
  goal_threshold_pct    smallint not null default 80 check (goal_threshold_pct between 1 and 100),
  extra                 jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.app_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  value       jsonb not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- 2) Geography (imported from OCHA COD-AB P-codes)
-- =====================================================================
create table public.regions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- north, northeast, central, east, west, south
  name_th     text not null,
  name_en     text not null,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.provinces (
  id              uuid primary key default gen_random_uuid(),
  pcode           text not null unique,      -- e.g. TH20 (from COD-AB adm1_pcode)
  slug            text not null unique,      -- e.g. chon-buri (URL)
  name_th         text not null,
  name_en         text not null,
  region_id       uuid not null references public.regions(id),
  summary         text,
  best_season     text,                      -- free text, e.g. "พ.ย.–ก.พ."
  best_months     smallint[] not null default '{}',  -- 1..12, used for "เหมาะกับฤดูกาล"
  center_lat      numeric(9,6) check (center_lat between -90 and 90),
  center_lng      numeric(9,6) check (center_lng between -180 and 180),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index provinces_region_idx on public.provinces(region_id);

create table public.districts (
  id           uuid primary key default gen_random_uuid(),
  pcode        text not null unique,         -- e.g. TH2004
  province_id  uuid not null references public.provinces(id) on delete cascade,
  name_th      text not null,
  name_en      text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index districts_province_idx on public.districts(province_id);

create table public.subdistricts (
  id           uuid primary key default gen_random_uuid(),
  pcode        text not null unique,         -- e.g. TH200401
  district_id  uuid not null references public.districts(id) on delete cascade,
  name_th      text not null,
  name_en      text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index subdistricts_district_idx on public.subdistricts(district_id);

-- =====================================================================
-- 3) Catalog
-- =====================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_th     text not null,
  name_en     text,
  icon        text not null default 'MapPin',   -- Lucide icon name
  color       text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_th     text not null,
  created_at  timestamptz not null default now()
);

-- Central (admin-managed) places
create table public.places (
  id                   uuid primary key default gen_random_uuid(),
  name_th              text not null check (char_length(name_th) between 1 and 200),
  name_en              text,
  province_id          uuid not null references public.provinces(id),
  district_id          uuid references public.districts(id),
  subdistrict_id       uuid references public.subdistricts(id),
  category_id          uuid not null references public.categories(id),
  short_description    text check (char_length(short_description) <= 500),
  highlights           text[] not null default '{}',
  lat                  numeric(9,6) check (lat between 5 and 21),    -- Thailand bbox
  lng                  numeric(9,6) check (lng between 97 and 106),
  address              text,
  opening_hours        jsonb,       -- {"mon":[["08:00","17:00"]],...,"note":"..."}  null = unknown
  opening_hours_text   text,
  closed_days_text     text,
  fee_thai             numeric(10,2) check (fee_thai >= 0),
  fee_foreigner        numeric(10,2) check (fee_foreigner >= 0),
  parking_fee          numeric(10,2) check (parking_fee >= 0),
  est_cost_per_person  numeric(10,2) check (est_cost_per_person >= 0),
  suggested_minutes    smallint check (suggested_minutes between 5 and 1440),
  best_time_of_day     text,
  best_months          smallint[] not null default '{}',
  phone                text,
  website_url          text check (website_url is null or website_url ~* '^https?://'),
  social_url           text check (social_url is null or social_url ~* '^https?://'),
  google_maps_url      text check (google_maps_url is null or google_maps_url ~* '^https?://'),
  cover_image_id       uuid,        -- FK added after place_images
  popularity           smallint not null default 0,
  state                public.place_state not null default 'active',
  verification         public.verification_status not null default 'pending',
  verified_at          date,
  is_demo              boolean not null default false,
  is_published         boolean not null default true,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint places_latlng_pair check ((lat is null) = (lng is null))
);
create index places_province_idx     on public.places(province_id) where is_published;
create index places_district_idx     on public.places(district_id);
create index places_category_idx     on public.places(category_id);
create index places_verification_idx on public.places(verification, verified_at);
create index places_name_lower_idx   on public.places(lower(name_th));

create table public.place_sources (
  id           uuid primary key default gen_random_uuid(),
  place_id     uuid not null references public.places(id) on delete cascade,
  source_url   text not null check (source_url ~* '^https?://'),
  source_name  text,
  source_type  text not null default 'official'
               check (source_type in ('tat','province','national_park','local_gov','official_social','osm','other')),
  fields       text[] not null default '{}',   -- which fields this source backs
  checked_at   date not null,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index place_sources_place_idx on public.place_sources(place_id);

create table public.place_images (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid not null references public.places(id) on delete cascade,
  storage_path  text,                 -- in bucket place-images
  external_url  text check (external_url is null or external_url ~* '^https://'),
  license       text not null,        -- e.g. CC BY-SA 4.0, own photo
  author        text,
  source_url    text,
  alt_th        text,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint place_images_has_file check (storage_path is not null or external_url is not null)
);
create index place_images_place_idx on public.place_images(place_id);

alter table public.places
  add constraint places_cover_fk foreign key (cover_image_id)
  references public.place_images(id) on delete set null;

create table public.place_facilities (
  id                 uuid primary key default gen_random_uuid(),
  place_id           uuid not null unique references public.places(id) on delete cascade,
  has_toilet         boolean,   -- null = unknown
  has_parking        boolean,
  elderly_friendly   boolean,
  wheelchair         boolean,
  kid_friendly       boolean,
  pet_friendly       boolean,
  other              text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.place_tags (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references public.places(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (place_id, tag_id)
);

-- Personal places (private by default, can be submitted to admin)
create table public.user_places (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name_th             text not null check (char_length(name_th) between 1 and 200),
  name_en             text,
  province_id         uuid references public.provinces(id),
  district_id         uuid references public.districts(id),
  category_id         uuid references public.categories(id),
  short_description   text check (char_length(short_description) <= 500),
  lat                 numeric(9,6) check (lat between -90 and 90),
  lng                 numeric(9,6) check (lng between -180 and 180),
  address             text,
  opening_hours       jsonb,
  suggested_minutes   smallint check (suggested_minutes between 5 and 1440),
  est_cost_per_person numeric(10,2) check (est_cost_per_person >= 0),
  google_maps_url     text check (google_maps_url is null or google_maps_url ~* '^https?://'),
  notes               text,
  submission          public.submission_status not null default 'private',
  promoted_place_id   uuid references public.places(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint user_places_latlng_pair check ((lat is null) = (lng is null))
);
create index user_places_owner_idx on public.user_places(owner_id);
create index user_places_submission_idx on public.user_places(submission) where submission = 'submitted';

-- Per-user status for a place (central OR personal)
create table public.user_place_status (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  place_id       uuid references public.places(id) on delete cascade,
  user_place_id  uuid references public.user_places(id) on delete cascade,
  status         public.place_user_status not null default 'none',
  personal_rating smallint check (personal_rating between 1 and 5),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ups_one_target check (num_nonnulls(place_id, user_place_id) = 1)
);
create unique index ups_user_place_uq      on public.user_place_status(user_id, place_id)      where place_id is not null;
create unique index ups_user_userplace_uq  on public.user_place_status(user_id, user_place_id) where user_place_id is not null;

create table public.favorites (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  place_id       uuid references public.places(id) on delete cascade,
  user_place_id  uuid references public.user_places(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint fav_one_target check (num_nonnulls(place_id, user_place_id) = 1)
);
create unique index fav_user_place_uq     on public.favorites(user_id, place_id)      where place_id is not null;
create unique index fav_user_userplace_uq on public.favorites(user_id, user_place_id) where user_place_id is not null;

-- =====================================================================
-- 4) Trips
-- =====================================================================
create table public.trips (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  province_ids      uuid[] not null default '{}',
  start_date        date not null,
  end_date          date not null,
  travelers         smallint not null default 2 check (travelers between 1 and 50),
  mode              public.travel_mode not null default 'car',
  vehicle_count     smallint not null default 1 check (vehicle_count between 0 and 20),
  start_point       jsonb,   -- {"label":"บ้าน","lat":..,"lng":..}  PRIVATE: never exposed in share links
  end_point         jsonb,
  day_start_time    time not null default '07:00',
  day_end_time      time not null default '20:00',
  budget_total      numeric(12,2) check (budget_total >= 0),
  budget_per_person numeric(12,2) check (budget_per_person >= 0),
  reserve_pct       smallint not null default 10 check (reserve_pct between 0 and 50),
  fuel_km_per_l     numeric(5,2) check (fuel_km_per_l > 0),
  fuel_price_per_l  numeric(6,2) check (fuel_price_per_l >= 0),
  road_factor       numeric(3,2) not null default 1.30 check (road_factor between 1 and 3),
  cover_path        text,
  notes             text,
  share_token       uuid unique,   -- Phase later: read-only link
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint trips_dates check (end_date >= start_date and end_date - start_date <= 60)
);
create index trips_owner_idx on public.trips(owner_id);

create table public.trip_members (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.trip_member_role not null default 'editor',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members(user_id);

create table public.trip_days (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  day_index     smallint not null check (day_index >= 1),
  date          date,
  start_time    time,
  is_rest_day   boolean not null default false,
  title         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (trip_id, day_index)
);

create table public.accommodations (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  name           text not null,
  lat            numeric(9,6) check (lat between -90 and 90),
  lng            numeric(9,6) check (lng between -180 and 180),
  address        text,
  check_in_date  date,
  check_in_time  time default '14:00',
  check_out_date date,
  check_out_time time default '12:00',
  cost_total     numeric(12,2) check (cost_total >= 0),
  booking_ref    text,
  phone          text,
  url            text check (url is null or url ~* '^https?://'),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index accommodations_trip_idx on public.accommodations(trip_id);

create table public.trip_items (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips(id) on delete cascade,
  day_id            uuid references public.trip_days(id) on delete cascade, -- null = not yet scheduled
  item_type         public.trip_item_type not null default 'place',
  place_id          uuid references public.places(id) on delete set null,
  user_place_id     uuid references public.user_places(id) on delete set null,
  accommodation_id  uuid references public.accommodations(id) on delete set null,
  title             text not null,          -- snapshot of name (survives place deletion)
  lat               numeric(9,6),
  lng               numeric(9,6),
  sort_order        integer not null default 0,
  start_time        time,
  end_time          time,
  duration_min      smallint check (duration_min between 0 and 1440),
  travel_min_override smallint check (travel_min_override between 0 and 1440), -- e.g. ferry
  est_cost          numeric(12,2) check (est_cost >= 0),
  is_locked_time    boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint trip_items_time check (end_time is null or start_time is null or end_time >= start_time)
);
create index trip_items_trip_day_idx on public.trip_items(trip_id, day_id, sort_order);

create table public.trip_routes (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  day_id        uuid references public.trip_days(id) on delete cascade,
  provider      text not null default 'haversine' check (provider in ('haversine','ors','mapbox','google')),
  mode          public.travel_mode not null default 'car',
  road_factor   numeric(3,2),
  distance_km   numeric(9,2) check (distance_km >= 0),
  duration_min  integer check (duration_min >= 0),
  is_estimate   boolean not null default true,
  legs          jsonb not null default '[]'::jsonb, -- [{from,to,km,min}]
  geometry      jsonb,                              -- optional encoded polyline from provider
  computed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index trip_routes_day_uq on public.trip_routes(trip_id, coalesce(day_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- =====================================================================
-- 5) Budget
-- =====================================================================
create table public.budget_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_th     text not null,
  icon        text not null default 'Wallet',
  color       text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.budget_items (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  category_id    uuid not null references public.budget_categories(id),
  day_id         uuid references public.trip_days(id) on delete set null,
  trip_item_id   uuid references public.trip_items(id) on delete set null,
  label          text not null,
  estimated      numeric(12,2) not null default 0 check (estimated >= 0),
  actual         numeric(12,2) check (actual >= 0),
  is_shared      boolean not null default true,     -- หารร่วม vs ส่วนตัว
  paid_by        uuid references auth.users(id) on delete set null,
  is_auto        boolean not null default false,    -- generated (fuel, entry fees); regenerated on re-plan
  spent_at       timestamptz,
  notes          text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index budget_items_trip_idx on public.budget_items(trip_id, category_id);

-- =====================================================================
-- 6) Visits & memories
-- =====================================================================
create table public.visited_places (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  place_id         uuid references public.places(id) on delete set null,
  user_place_id    uuid references public.user_places(id) on delete set null,
  province_id      uuid references public.provinces(id),   -- denormalized for stats
  place_name       text not null,                          -- snapshot
  trip_id          uuid references public.trips(id) on delete set null,
  visited_on       date not null,
  rating           smallint check (rating between 1 and 5),
  impression       text check (char_length(impression) <= 4000),
  notes            text,
  liked            text,
  caution          text,
  actual_cost      numeric(12,2) check (actual_cost >= 0),
  companions       text,
  want_return      boolean,
  cover_photo_id   uuid,
  share_with_trip  boolean not null default false,  -- let trip co-members see it
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index visited_user_date_idx     on public.visited_places(user_id, visited_on desc);
create index visited_user_province_idx on public.visited_places(user_id, province_id);

create table public.travel_memories (       -- journal entries (per trip/day), not tied to one place
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trip_id     uuid references public.trips(id) on delete set null,
  title       text not null,
  body        text check (char_length(body) <= 10000),
  memory_date date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index travel_memories_user_idx on public.travel_memories(user_id, memory_date desc);

create table public.memory_photos (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  visited_place_id   uuid references public.visited_places(id) on delete cascade,
  memory_id          uuid references public.travel_memories(id) on delete cascade,
  storage_path       text not null unique,   -- memory-photos/{user_id}/...
  width              integer,
  height             integer,
  size_bytes         integer check (size_bytes between 1 and 5242880),
  mime_type          text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  caption            text,
  taken_at           timestamptz,
  sort_order         smallint not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint memory_photos_one_parent check (num_nonnulls(visited_place_id, memory_id) = 1)
);
create index memory_photos_visit_idx on public.memory_photos(visited_place_id);

alter table public.visited_places
  add constraint visited_cover_fk foreign key (cover_photo_id)
  references public.memory_photos(id) on delete set null;

-- =====================================================================
-- 7) Import logs
-- =====================================================================
create table public.import_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  kind          text not null check (kind in ('admin_places_csv','admin_places_json','user_backup')),
  file_name     text,
  mode          text check (mode in ('merge','replace','insert')),
  schema_version integer,
  total_rows    integer not null default 0,
  inserted      integer not null default 0,
  updated       integer not null default 0,
  skipped       integer not null default 0,
  errors        jsonb not null default '[]'::jsonb,  -- [{row, message}] no personal data
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- updated_at triggers for every table that has updated_at
-- =====================================================================
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- =====================================================================
-- Auth bootstrap: profile + settings for every new user
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trip owner automatically becomes a member
create or replace function public.handle_new_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_members (trip_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.handle_new_trip();
