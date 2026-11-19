-- =====================================================================
-- เที่ยวไทย 77 จังหวัด — Search Test (Migration 008)
--
-- วิธีใช้: Supabase → SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
-- ผลจะขึ้นเป็น "ERROR" สีแดงที่มีรายงานอยู่ข้างใน (ตั้งใจ — เพื่อ ROLLBACK ข้อมูลทดสอบทั้งหมด)
-- ท้ายรายงานต้องขึ้น "ALL PASSED"
-- ต้องรัน migrations 001–008 และ seed.sql ก่อน (ต้องมีอย่างน้อย 1 ภาคในตาราง regions)
-- ข้อมูลทดสอบใช้ชื่อ "ซีซี…" และกรองด้วยจังหวัดทดสอบ จึงไม่ปนกับข้อมูลจริง
-- =====================================================================

create function public._s_chk(n text, ok boolean) returns text language sql immutable as $$
  select (case when coalesce(ok, false) then 'PASS  ' else 'FAIL  ' end) || n
$$;

-- one value of a query as text ('ERROR: …' when it fails)
create function public._s_val(q text) returns text language plpgsql as $$
declare v text;
begin
  execute q into v;
  return v;
exception when others then return 'ERROR: ' || sqlerrm;
end $$;

-- names (in order) found by search_places, separated by "|"
create function public._s_names(p_q text, p_prov uuid default null, p_cat uuid default null, p_lim int default 20, p_off int default 0)
returns text language plpgsql as $$
declare v text;
begin
  select coalesce(string_agg(name_th, '|' order by ord), '') into v
  from (select name_th, row_number() over () as ord from public.search_places(p_q, p_prov, p_cat, p_lim, p_off)) s;
  return v;
exception when others then return 'ERROR: ' || sqlerrm;
end $$;

create function public._s_total(p_q text, p_prov uuid default null, p_cat uuid default null, p_lim int default 20, p_off int default 0)
returns text language plpgsql as $$
declare v text;
begin
  select coalesce(max(total)::text, '0') into v from public.search_places(p_q, p_prov, p_cat, p_lim, p_off);
  return v;
exception when others then return 'ERROR: ' || sqlerrm;
end $$;

create function public._s_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;
end $$;

create function public._s_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;

grant execute on function public._s_chk(text, boolean), public._s_val(text), public._s_names(text, uuid, uuid, int, int),
  public._s_total(text, uuid, uuid, int, int), public._s_as(uuid), public._s_anon() to anon, authenticated;

do $s$
declare
  u uuid := gen_random_uuid();       -- ผู้ใช้ทั่วไป
  adm uuid := gen_random_uuid();     -- Admin
  reg uuid; prov uuid; dist uuid; cat uuid; cat2 uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid; h uuid; j uuid;
  expect_all bigint;
  rep text := ''; total int; passed int; v text;
begin
  if to_regprocedure('public.search_places(text,uuid,uuid,integer,integer)') is null then
    raise exception 'ยังไม่ได้รัน Migration 008 (search)';
  end if;
  select id into reg from public.regions limit 1;
  if reg is null then raise exception 'ยังไม่มีข้อมูลภาค — รัน seed.sql ก่อน'; end if;

  -- ===== เตรียมข้อมูล =====
  insert into auth.users (id, email, aud, role) values
    (u,   'search-u@example.invalid',   'authenticated', 'authenticated'),
    (adm, 'search-adm@example.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = adm;

  insert into public.provinces (pcode, slug, name_th, name_en, region_id) values ('ZZ99', 'zz-test-prov', 'ซีซีแลนด์', 'ZZ Land', reg) returning id into prov;
  insert into public.districts (pcode, province_id, name_th, name_en) values ('ZZ9901', prov, 'ซีซีเมือง', 'ZZ City') returning id into dist;
  insert into public.categories (slug, name_th, name_en) values ('zz-cat', 'หมวดซีซี', 'ZZ Category') returning id into cat;
  insert into public.categories (slug, name_th, name_en) values ('zz-cat2', 'หมวดสองซีซี', 'ZZ Second') returning id into cat2;

  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('ซีซีวัด',        null,          prov, dist, cat, 10) returning id into a;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('ซีซีวัดใหญ่',    null,          prov, dist, cat, 50) returning id into b;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('ที่ซีซีวัดเก่า',  null,          prov, dist, cat,  5) returning id into c;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('ถ้ำเงียบ',        null,          prov, dist, cat,  1) returning id into d;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity, is_published) values ('ซีซีลับ', null,   prov, dist, cat,  1, false) returning id into e;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('ลด 50% พิเศษ',     null,          prov, null, cat,  1) returning id into f;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('แท็ก_เทส',         null,          prov, null, cat,  1) returning id into g;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('เนินน้อย',         'Cheeky Hill', prov, null, cat,  1) returning id into h;
  insert into public.places (name_th, name_en, province_id, district_id, category_id, popularity) values ('ซีซีอื่น',         null,          prov, null, cat2, 1) returning id into j;
  for i in 1..7 loop
    insert into public.places (name_th, province_id, category_id, popularity) values ('หน้าทดสอบ ' || i, prov, cat, 100 - i);
  end loop;
  select count(*) into expect_all from public.places where province_id = prov and is_published;

  -- ===== 1) ผู้เยี่ยมชม (anon) =====
  perform public._s_anon();
  rep := rep || public._s_chk('anon: เรียกฟังก์ชันค้นหาได้', public._s_names('ซีซีวัดใหญ่', prov) = 'ซีซีวัดใหญ่') || E'\n';
  rep := rep || public._s_chk('anon: ไม่เห็นสถานที่ที่ปิดการแสดง', public._s_names('ซีซีลับ', prov) = '') || E'\n';
  rep := rep || public._s_chk('anon: ค้นด้วยคำที่ไม่มี → ไม่มีผล', public._s_total('คำที่ไม่มีแน่นอนxyz', prov) = '0') || E'\n';

  -- ===== 2) ผู้ใช้ทั่วไป / Admin กับ RLS =====
  perform public._s_as(u);
  rep := rep || public._s_chk('ผู้ใช้ทั่วไป: ไม่เห็นสถานที่ที่ปิดการแสดง', public._s_names('ซีซีลับ', prov) = '') || E'\n';
  rep := rep || public._s_chk('ผู้ใช้ทั่วไป: ค้นเจอสถานที่ที่เผยแพร่', public._s_names('ซีซีวัดใหญ่', prov) = 'ซีซีวัดใหญ่') || E'\n';
  perform public._s_as(adm);
  rep := rep || public._s_chk('Admin: เห็นสถานที่ที่ปิดการแสดง', public._s_names('ซีซีลับ', prov) = 'ซีซีลับ') || E'\n';

  -- ===== 3) ตรรกะการค้นหา (ทดสอบในฐานะ anon) =====
  perform public._s_anon();
  rep := rep || public._s_chk('ค้นชื่อบางส่วน (ตรงกลางคำ)', public._s_names('วัดเก่า', prov) = 'ที่ซีซีวัดเก่า') || E'\n';
  rep := rep || public._s_chk('ไม่สนตัวพิมพ์เล็ก/ใหญ่ (อังกฤษ) และค้นจากชื่ออังกฤษได้', public._s_names('CHEEKY', prov) = 'เนินน้อย') || E'\n';
  rep := rep || public._s_chk('ค้นจากชื่อจังหวัด → เจอสถานที่ทุกแห่งในจังหวัดนั้น', public._s_total('ซีซีแลนด์', prov) = expect_all::text) || E'\n';
  rep := rep || public._s_chk('ค้นจากชื่ออำเภอ', public._s_names('ซีซีเมือง', prov) = 'ซีซีวัดใหญ่|ซีซีวัด|ที่ซีซีวัดเก่า|ถ้ำเงียบ') || E'\n';
  rep := rep || public._s_chk('ค้นจากชื่อหมวด (ไทย)', public._s_total('หมวดซีซี', prov) = (expect_all - 1)::text) || E'\n'; -- ซีซีอื่น อยู่หมวด 2 ('หมวดสองซีซี' ไม่มีคำว่า "หมวดซีซี")
  rep := rep || public._s_chk('ค้นจากชื่อหมวด (อังกฤษ)', public._s_total('ZZ Category', prov) = (expect_all - 1)::text) || E'\n';
  rep := rep || public._s_chk('หลายคำ: ทุกคำต้องเจอ (จังหวัด + ชื่อ)', public._s_names('ซีซีแลนด์ ซีซีวัดใหญ่', prov) = 'ซีซีวัดใหญ่') || E'\n';
  rep := rep || public._s_chk('หลายคำ: คำหนึ่งไม่เจอ → ไม่มีผล', public._s_total('ซีซีวัดใหญ่ ไม่มีคำนี้', prov) = '0') || E'\n';
  rep := rep || public._s_chk('เว้นวรรคซ้ำ/หัวท้ายไม่ทำให้ผลเปลี่ยน', public._s_names('   ซีซีแลนด์    ซีซีวัดใหญ่  ', prov) = 'ซีซีวัดใหญ่') || E'\n';

  -- ===== 4) ลำดับผล =====
  rep := rep || public._s_chk('เรียงลำดับ: ตรงทั้งชื่อ → ขึ้นต้นด้วย → มีคำในชื่อ', public._s_names('ซีซีวัด', prov) = 'ซีซีวัด|ซีซีวัดใหญ่|ที่ซีซีวัดเก่า') || E'\n';
  v := public._s_val($q$select rank::text from public.search_places('ซีซี', (select id from public.provinces where pcode = 'ZZ99')) where name_th = 'ถ้ำเงียบ'$q$);
  rep := rep || public._s_chk('ที่เจอจากจังหวัด/หมวดอย่างเดียวได้ rank 3', v = '3') || E'\n';
  v := public._s_val($q$select rank::text from public.search_places('ซีซีวัด', (select id from public.provinces where pcode = 'ZZ99')) where name_th = 'ซีซีวัด'$q$);
  rep := rep || public._s_chk('ตรงทั้งชื่อ ได้ rank 0', v = '0') || E'\n';
  rep := rep || public._s_chk('rank เท่ากัน: ความนิยมสูงกว่ามาก่อน', public._s_names('ซีซี', prov, null, 2) = 'ซีซีวัดใหญ่|ซีซีวัด') || E'\n';

  -- ===== 5) อักขระพิเศษ + ความปลอดภัยของคำค้น =====
  rep := rep || public._s_chk('"%" ถูกมองเป็นตัวอักษร ไม่ใช่ wildcard (เจอเฉพาะที่มี % จริง)', public._s_names('%', prov) = 'ลด 50% พิเศษ') || E'\n';
  rep := rep || public._s_chk('"_" ถูกมองเป็นตัวอักษร (เจอเฉพาะที่มี _ จริง)', public._s_names('_', prov) = 'แท็ก_เทส') || E'\n';
  rep := rep || public._s_chk('"5_" ไม่ไปแมตช์ "50"', public._s_total('5_', prov) = '0') || E'\n';
  rep := rep || public._s_chk('"50%" เจอ "ลด 50% พิเศษ"', public._s_names('50%', prov) = 'ลด 50% พิเศษ') || E'\n';
  rep := rep || public._s_chk('"\" ไม่ทำให้ error', public._s_total('\', prov) = '0') || E'\n';
  rep := rep || public._s_chk('SQL injection ไม่ทำงาน (ไม่ error, ไม่มีผล)', public._s_total($$'; drop table public.places; --$$, prov) = '0') || E'\n';
  rep := rep || public._s_chk('...และตาราง places ยังอยู่', to_regclass('public.places') is not null) || E'\n';
  rep := rep || public._s_chk('คำค้นว่าง → ไม่มีผล', public._s_total('', prov) = '0') || E'\n';
  rep := rep || public._s_chk('คำค้นเป็นช่องว่างล้วน → ไม่มีผล', public._s_total('     ', prov) = '0') || E'\n';
  rep := rep || public._s_chk('คำค้นเป็น NULL → ไม่มีผล ไม่ error', public._s_val('select count(*)::text from public.search_places(null)') = '0') || E'\n';
  rep := rep || public._s_chk('คำค้นยาว 500 ตัวอักษร → ไม่ error', public._s_total(repeat('ก', 500), prov) = '0') || E'\n';
  rep := rep || public._s_chk('คำค้น 10 คำ (ใช้แค่ 5 คำแรก) → ไม่ error', public._s_total('ก ข ค ง จ ฉ ช ซ ฌ ญ', prov) = '0') || E'\n';
  rep := rep || public._s_chk('มีคำที่ 6 เป็นต้นไปที่ไม่เจอ ก็ยังได้ผล (ใช้แค่ 5 คำแรก)', public._s_total('ซีซีแลนด์ ซีซีเมือง ZZ City หมวดซีซี ZZ Category ไม่มีคำนี้แน่นอน', prov) <> '0') || E'\n';

  -- ===== 6) ตัวกรอง =====
  rep := rep || public._s_chk('กรองหมวด', public._s_names('ซีซี', prov, cat2) = 'ซีซีอื่น') || E'\n';
  rep := rep || public._s_chk('กรองจังหวัดที่ไม่ตรง → ไม่มีผล', public._s_total('ซีซีวัด', gen_random_uuid()) = '0') || E'\n';
  rep := rep || public._s_chk('ไม่กรองจังหวัด ก็ยังเจอสถานที่นั้น', (select count(*) from public.search_places('ซีซีวัดใหญ่') where id = b) = 1) || E'\n';

  -- ===== 7) แบ่งหน้า =====
  rep := rep || public._s_chk('จำนวนทั้งหมดถูกต้อง', public._s_total('หน้าทดสอบ', prov, null, 3, 0) = '7') || E'\n';
  rep := rep || public._s_chk('หน้า 1 (limit 3)', public._s_names('หน้าทดสอบ', prov, null, 3, 0) = 'หน้าทดสอบ 1|หน้าทดสอบ 2|หน้าทดสอบ 3') || E'\n';
  rep := rep || public._s_chk('หน้า 3 มี 1 แถว และจำนวนทั้งหมดยังเป็น 7', public._s_names('หน้าทดสอบ', prov, null, 3, 6) = 'หน้าทดสอบ 7' and public._s_total('หน้าทดสอบ', prov, null, 3, 6) = '7') || E'\n';
  rep := rep || public._s_chk('เกินหน้าสุดท้าย → ไม่มีแถว', public._s_names('หน้าทดสอบ', prov, null, 3, 7) = '') || E'\n';
  rep := rep || public._s_chk('limit 0 ถูกปรับเป็น 1', public._s_names('หน้าทดสอบ', prov, null, 0, 0) = 'หน้าทดสอบ 1') || E'\n';
  rep := rep || public._s_chk('limit ติดลบ ถูกปรับเป็น 1', public._s_names('หน้าทดสอบ', prov, null, -5, 0) = 'หน้าทดสอบ 1') || E'\n';
  rep := rep || public._s_chk('limit เกิน 50 ถูกจำกัดที่ 50', (select count(*) from public.search_places('ซีซี', prov, null, 100000, 0)) <= 50) || E'\n';
  rep := rep || public._s_chk('offset ติดลบ ถูกมองเป็น 0', public._s_names('หน้าทดสอบ', prov, null, 2, -10) = 'หน้าทดสอบ 1|หน้าทดสอบ 2') || E'\n';
  rep := rep || public._s_chk('limit/offset เป็น NULL ใช้ค่าเริ่มต้น ไม่ error', public._s_val('select count(*)::text from public.search_places(''ซีซี'', null, null, null, null)') not like 'ERROR%') || E'\n';
  rep := rep || public._s_chk('ผลซ้ำกันไม่ได้ระหว่างหน้า (เรียงลำดับคงที่)',
    (select count(distinct id) from (select id from public.search_places('หน้าทดสอบ', prov, null, 3, 0) union all select id from public.search_places('หน้าทดสอบ', prov, null, 3, 3) union all select id from public.search_places('หน้าทดสอบ', prov, null, 3, 6)) s) = 7) || E'\n';

  -- ===== 8) การตั้งค่าของฟังก์ชัน =====
  reset role;
  rep := rep || public._s_chk('search_places เป็น SECURITY INVOKER (ใช้ RLS ของผู้เรียก)', (select not prosecdef from pg_proc where oid = 'public.search_places(text,uuid,uuid,integer,integer)'::regprocedure)) || E'\n';
  rep := rep || public._s_chk('search_places ตั้ง search_path ไว้', (select coalesce(array_to_string(proconfig, ','), '') like '%search_path%' from pg_proc where oid = 'public.search_places(text,uuid,uuid,integer,integer)'::regprocedure)) || E'\n';
  rep := rep || public._s_chk('anon เรียก search_places ได้', has_function_privilege('anon', 'public.search_places(text,uuid,uuid,integer,integer)', 'execute')) || E'\n';
  rep := rep || public._s_chk('authenticated เรียก search_places ได้', has_function_privilege('authenticated', 'public.search_places(text,uuid,uuid,integer,integer)', 'execute')) || E'\n';
  rep := rep || public._s_chk('search_places ไม่ส่งคอลัมน์ที่เป็นข้อมูลส่วนตัว (ไม่มี notes/created_by/owner)',
    not exists (select 1 from pg_proc where proname = 'search_places' and proargnames && array['notes', 'created_by', 'owner_id', 'phone', 'address'])) || E'\n';

  select count(*), count(*) filter (where l like 'PASS%') into total, passed
    from unnest(string_to_array(rep, E'\n')) l where l <> '';

  raise exception E'\n================ SEARCH TEST REPORT ================\n%\n====================================================\n%',
    rep,
    case when passed = total
      then format('ALL PASSED %s/%s  (ข้อมูลทดสอบถูก rollback แล้ว — ไม่เหลือในฐานข้อมูล)', passed, total)
      else format('FAILED %s จาก %s ข้อ — ดูบรรทัดที่ขึ้นต้นด้วย FAIL', total - passed, total) end;
end
$s$;
