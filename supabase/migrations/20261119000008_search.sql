-- =====================================================================
-- Migration 008: ค้นหาสถานที่ทั่วประเทศ
--   * search_places(): ค้นชื่อสถานที่ (ไทย/อังกฤษ) + จังหวัด + อำเภอ + หมวด
--       - พิมพ์หลายคำได้ (เว้นวรรค) ทุกคำต้องเจอในช่องใดช่องหนึ่ง เช่น "ชลบุรี วัด"
--       - SECURITY INVOKER: ใช้ RLS ตามเดิม (สถานที่ที่ปิดการแสดงผู้ใช้ทั่วไปไม่เห็น)
--       - อักขระพิเศษของ LIKE (% _ \) ถูก escape ให้เป็นตัวอักษรธรรมดา
--       - แบ่งหน้าได้ (limit สูงสุด 50) และคืนจำนวนทั้งหมดมาด้วยทุกแถว
--   * pg_trgm + index (ช่วยให้เร็วขึ้นเมื่อสถานที่มีเยอะ) — ไม่บังคับ:
--       ถ้าเปิด extension ไม่ได้ การค้นหายังทำงานถูกต้อง เพียงไม่มี index ช่วย
-- =====================================================================

-- ---------- index (ทำได้ก็ทำ ไม่ได้ก็ข้าม ไม่ให้ Migration ล้ม) ----------
do $do$
declare
  ns text;
begin
  begin
    create extension if not exists pg_trgm with schema extensions;
  exception when others then
    begin
      create extension if not exists pg_trgm;
    exception when others then
      raise notice 'pg_trgm เปิดใช้งานไม่ได้ — การค้นหายังใช้ได้ตามปกติ แต่ไม่มี index ช่วยให้เร็วขึ้น';
    end;
  end;

  select n.nspname into ns
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';
  if ns is null then
    return;
  end if;

  begin
    execute format('create index if not exists places_name_th_trgm_idx on public.places using gin (name_th %I.gin_trgm_ops)', ns);
    execute format('create index if not exists places_name_en_trgm_idx on public.places using gin (name_en %I.gin_trgm_ops)', ns);
  exception when others then
    raise notice 'สร้าง trigram index ไม่สำเร็จ — การค้นหายังใช้ได้ตามปกติ';
  end;
end
$do$;

-- ---------- helper: ทำให้ % _ \ เป็นตัวอักษรธรรมดาใน LIKE ----------
create or replace function public.like_escape(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(coalesce(p_text, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- ---------- ค้นหา ----------
create or replace function public.search_places(
  p_q        text,
  p_province uuid    default null,
  p_category uuid    default null,
  p_limit    integer default 20,
  p_offset   integer default 0
)
returns table (
  id                uuid,
  name_th           text,
  name_en           text,
  province_id       uuid,
  district_id       uuid,
  district_name     text,
  category_id       uuid,
  short_description text,
  lat               numeric,
  lng               numeric,
  verification      public.verification_status,
  is_demo           boolean,
  popularity        smallint,
  rank              smallint,   -- 0 ตรงทั้งชื่อ · 1 ขึ้นต้นด้วย · 2 มีคำครบในชื่อ · 3 เจอจากจังหวัด/อำเภอ/หมวด
  total             bigint      -- จำนวนผลทั้งหมด (ก่อนแบ่งหน้า)
)
language sql
stable
set search_path = public
as $$
  with norm as (
    select left(regexp_replace(btrim(coalesce(p_q, '')), '\s+', ' ', 'g'), 80) as s
  ),
  toks as (
    select u.t, u.i
    from norm, unnest(string_to_array(norm.s, ' ')) with ordinality as u(t, i)
    where u.t <> '' and u.i <= 5
  ),
  pats as (
    select coalesce(array_agg('%' || public.like_escape(t) || '%' order by i), '{}'::text[]) as arr
    from toks
  ),
  base as (
    select
      p.id, p.name_th, p.name_en, p.province_id, p.district_id,
      d.name_th as district_name,
      p.category_id, p.short_description, p.lat, p.lng, p.verification, p.is_demo, p.popularity,
      (case
        when lower(p.name_th) = lower(norm.s) or lower(coalesce(p.name_en, '')) = lower(norm.s) then 0
        when p.name_th ilike (public.like_escape(norm.s) || '%') escape '\'
          or coalesce(p.name_en, '') ilike (public.like_escape(norm.s) || '%') escape '\' then 1
        when not exists (
          select 1 from unnest(pats.arr) pat
          where not (p.name_th ilike pat escape '\' or coalesce(p.name_en, '') ilike pat escape '\')
        ) then 2
        else 3
      end)::smallint as rank
    from public.places p
    join public.provinces  pr on pr.id = p.province_id
    left join public.districts d on d.id = p.district_id
    join public.categories c  on c.id = p.category_id
    cross join norm
    cross join pats
    where cardinality(pats.arr) > 0
      and (p_province is null or p.province_id = p_province)
      and (p_category is null or p.category_id = p_category)
      and not exists (
        select 1 from unnest(pats.arr) pat
        where not (
          p.name_th ilike pat escape '\'
          or coalesce(p.name_en, '')  ilike pat escape '\'
          or pr.name_th ilike pat escape '\'
          or pr.name_en ilike pat escape '\'
          or coalesce(d.name_th, '')  ilike pat escape '\'
          or coalesce(d.name_en, '')  ilike pat escape '\'
          or c.name_th  ilike pat escape '\'
          or coalesce(c.name_en, '')  ilike pat escape '\'
        )
      )
  )
  select
    b.id, b.name_th, b.name_en, b.province_id, b.district_id, b.district_name, b.category_id,
    b.short_description, b.lat, b.lng, b.verification, b.is_demo, b.popularity, b.rank,
    count(*) over () as total
  from base b
  order by b.rank, b.popularity desc, b.name_th, b.id
  limit  least(greatest(coalesce(p_limit, 20), 1), 50)
  offset least(greatest(coalesce(p_offset, 0), 0), 5000)
$$;

revoke all on function public.search_places(text, uuid, uuid, integer, integer) from public;
grant execute on function public.search_places(text, uuid, uuid, integer, integer) to anon, authenticated;
