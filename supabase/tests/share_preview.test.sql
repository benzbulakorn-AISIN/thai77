-- =====================================================================
-- เที่ยวไทย 77 จังหวัด — Share Preview Test (Migration 010)
--
-- วิธีใช้: Supabase → SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
-- ผลจะขึ้นเป็น "ERROR" สีแดงที่มีรายงานอยู่ข้างใน (ตั้งใจ — เพื่อ ROLLBACK ข้อมูลทดสอบทั้งหมด)
-- ท้ายรายงานต้องขึ้น "ALL PASSED"
-- ต้องรัน migrations 001–010 ก่อน (ไฟล์นี้สร้างภาค/จังหวัด/สถานที่ทดสอบเอง ไม่ต้องมี seed)
-- แนะนำให้รัน share.test.sql (87 ข้อ) ซ้ำด้วย เพื่อยืนยันว่าฟังก์ชันของ 009 ยังเหมือนเดิม
--
-- สิ่งที่ตรวจหลัก: (1) ตัวอย่าง = ผลของ get_shared_trip จริงทุกตัวอักษร (ยกเว้นเวลาหมดอายุ)
-- (2) ตัวอย่างไม่ทิ้งแถวใน trip_shares และไม่กินโควตา 5 ลิงก์  (3) เฉพาะเจ้าของเรียกได้  (4) ไม่มีข้อมูลรั่ว
-- =====================================================================

create function public._sp_chk(n text, ok boolean) returns text language sql immutable as $$
  select (case when coalesce(ok, false) then 'PASS  ' else 'FAIL  ' end) || n
$$;

-- SQLSTATE of a statement run as the CURRENT role ('ok' when it succeeds)
create function public._sp_err(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then return sqlstate;
end $$;

create function public._sp_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;
end $$;

create function public._sp_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;

create function public._sp_leaks(j jsonb, markers text[]) returns text language sql immutable as $$
  select coalesce(string_agg(m, ','), '') from unnest(markers) m where position(m in j::text) > 0
$$;

grant execute on function public._sp_chk(text, boolean), public._sp_err(text), public._sp_as(uuid), public._sp_anon(),
  public._sp_leaks(jsonb, text[]) to anon, authenticated;

do $s$
declare
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_e uuid := gen_random_uuid(); v_adm uuid := gen_random_uuid();
  v_reg uuid; v_p1 uuid; v_cat uuid; v_pub uuid; v_hid uuid; v_up uuid; v_acc uuid;
  v_trip uuid; v_trip_other uuid; v_d1 uuid; v_d2 uuid;
  pv1 jsonb; pv2 jsonb; pv3 jsonb; rl1 jsonb; rl2 jsonb; rl3 jsonb;
  s1 public.trip_shares; s2 public.trip_shares; s3 public.trip_shares;
  n_before int; n_after int; updated_before timestamptz; updated_after timestamptz; ok_all boolean; i int;
  hide_default text[] := array['SECRET','424242','313131','48.48','919191','616161','13.123456','100.654321','13.222222','100.333333',
    '13.555555','100.555555','12.111111','100.111111','12.222222','100.222222','12.333333','100.333334','99.999999','12.444444','100.444444'];
  hide_opened text[] := array['SECRET_TRIPNAME','SECRET_TRIPNOTE','SECRET_HOME','SECRET_COVER','SECRET_DAYTITLE','SECRET_DAYNOTE','SECRET_HOTEL_ADDR',
    'SECRET_BOOKING','SECRET_PHONE','secret.example','SECRET_HOTELNOTE','SECRET_ITEMNOTE','SECRET_HIDDEN_PLACE','SECRET_USERPLACE','SECRET_TYPED_PLACE',
    'SECRET_DEPART_HOME','424242','313131','48.48','919191','616161','13.123456','100.654321','13.222222','100.333333','13.555555','100.555555',
    '12.111111','100.111111','12.222222','100.222222','12.333333','100.333334','99.999999'];
  rep text := ''; total int; passed int;
begin
  if to_regprocedure('public.preview_trip_share(uuid,text,text,text,integer,boolean,boolean,boolean)') is null then
    raise exception 'ยังไม่ได้รัน Migration 010 (trip_share_preview)';
  end if;
  if to_regprocedure('public.get_shared_trip(uuid)') is null then
    raise exception 'ยังไม่ได้รัน Migration 009 (trip_share)';
  end if;

  -- ===== เตรียมข้อมูล =====
  insert into auth.users (id, email, aud, role) values
    (v_a, 'prev-a@example.invalid', 'authenticated', 'authenticated'), (v_b, 'prev-b@example.invalid', 'authenticated', 'authenticated'),
    (v_e, 'prev-e@example.invalid', 'authenticated', 'authenticated'), (v_adm, 'prev-adm@example.invalid', 'authenticated', 'authenticated');
  if to_regclass('public.profiles') is not null then update public.profiles set role = 'admin' where id = v_adm; end if;

  insert into public.regions (code, name_th, name_en) values ('zzpv', 'ภาคทดสอบตัวอย่าง', 'ZZ Preview') returning id into v_reg;
  insert into public.provinces (pcode, slug, name_th, name_en, region_id) values ('ZP01', 'zp-preview-1', 'จังหวัดทดสอบตัวอย่าง', 'ZP One', v_reg) returning id into v_p1;
  insert into public.categories (slug, name_th) values ('zp-cat', 'หมวดทดสอบตัวอย่าง') returning id into v_cat;
  insert into public.places (name_th, province_id, category_id, lat, lng, opening_hours_text, is_published) values ('ชายหาดสาธารณะ', v_p1, v_cat, 12.7, 100.9, 'Tu-Su 09:00-16:00', true) returning id into v_pub;
  insert into public.places (name_th, province_id, category_id, lat, lng, is_published) values ('SECRET_HIDDEN_PLACE', v_p1, v_cat, 12.111111, 100.111111, false) returning id into v_hid;
  insert into public.user_places (owner_id, name_th, notes, lat, lng) values (v_a, 'SECRET_USERPLACE', 'SECRET_USERPLACE_NOTE', 12.222222, 100.222222) returning id into v_up;

  insert into public.trips (owner_id, name, notes, province_ids, start_date, end_date, travelers, mode, vehicle_count, start_point, end_point,
      budget_total, budget_per_person, cover_path, share_token, day_start_time, day_end_time, road_factor)
  values (v_a, 'SECRET_TRIPNAME', 'SECRET_TRIPNOTE', array[v_p1], '2030-05-01', '2030-05-02', 37, 'car', 13,
      '{"label":"SECRET_HOME","lat":13.123456,"lng":100.654321}', '{"label":"SECRET_HOME_END","lat":13.222222,"lng":100.333333}',
      424242.42, 313131.31, 'SECRET_COVER/x.webp', gen_random_uuid(), '07:00', '20:00', 1.35) returning id into v_trip;
  -- ฐานข้อมูลจริงเพิ่มเจ้าของเข้า trip_members ให้เองผ่าน trigger (on_trip_created) จึงไม่ต้องใส่ owner เอง
  -- เพิ่มเฉพาะ Editor (on conflict กันไว้เผื่อบางสภาพแวดล้อมไม่มี trigger)
  insert into public.trip_members (trip_id, user_id, role) values (v_trip, v_a, 'owner') on conflict (trip_id, user_id) do nothing;
  insert into public.trip_members (trip_id, user_id, role) values (v_trip, v_e, 'editor') on conflict (trip_id, user_id) do nothing;
  insert into public.trips (owner_id, name, start_date, end_date) values (v_b, 'ทริปของคนอื่น', '2030-08-01', '2030-08-02') returning id into v_trip_other;

  insert into public.trip_days (trip_id, day_index, date, start_time, is_rest_day, title, notes) values (v_trip, 1, '2030-05-01', '07:30', false, 'SECRET_DAYTITLE', 'SECRET_DAYNOTE') returning id into v_d1;
  insert into public.trip_days (trip_id, day_index, date, is_rest_day, title, notes) values (v_trip, 2, '2030-05-02', false, 'SECRET_DAYTITLE2', 'SECRET_DAYNOTE2') returning id into v_d2;
  insert into public.accommodations (trip_id, name, lat, lng, address, cost_total, booking_ref, phone, url, notes)
    values (v_trip, 'SECRET_HOTEL_NAME', 13.555555, 100.555555, 'SECRET_HOTEL_ADDR', 919191.91, 'SECRET_BOOKING', 'SECRET_PHONE', 'https://secret.example/hotel', 'SECRET_HOTELNOTE') returning id into v_acc;

  insert into public.trip_items (trip_id, day_id, item_type, place_id, title, lat, lng, sort_order, duration_min, est_cost, notes)
    values (v_trip, v_d1, 'place', v_pub, 'SECRET_ITEMTITLE_PUBLIC', 99.999999, 99.999999, 10, 90, 616161.61, 'SECRET_ITEMNOTE');
  insert into public.trip_items (trip_id, day_id, item_type, place_id, title, lat, lng, sort_order) values (v_trip, v_d1, 'place', v_hid, 'SECRET_HIDDEN_PLACE', 12.111111, 100.111111, 20);
  insert into public.trip_items (trip_id, day_id, item_type, user_place_id, title, lat, lng, sort_order) values (v_trip, v_d1, 'place', v_up, 'SECRET_USERPLACE_TITLE', 12.222222, 100.222222, 30);
  insert into public.trip_items (trip_id, day_id, item_type, title, lat, lng, sort_order) values (v_trip, v_d1, 'place', 'SECRET_TYPED_PLACE', 12.333333, 100.333334, 40);
  insert into public.trip_items (trip_id, day_id, item_type, title, sort_order, notes) values (v_trip, v_d1, 'meal', 'ร้านพิมพ์เอง', 50, 'SECRET_MEALNOTE');
  insert into public.trip_items (trip_id, day_id, item_type, accommodation_id, title, lat, lng, sort_order) values (v_trip, v_d2, 'lodging', v_acc, 'SECRET_LODGE_ITEMTITLE', 13.555555, 100.555555, 10);
  insert into public.trip_items (trip_id, day_id, item_type, title, lat, lng, sort_order) values (v_trip, v_d2, 'depart', 'SECRET_DEPART_HOME', 13.123456, 100.654321, 20);
  insert into public.trip_items (trip_id, day_id, item_type, title, lat, lng, sort_order, is_locked_time, start_time, duration_min)
    values (v_trip, v_d2, 'custom', 'SECRET_TYPED_CUSTOM', 12.444444, 100.444444, 30, true, '14:00', 90);

  -- ===== 1) ใครเรียกได้บ้าง =====
  perform public._sp_anon();
  rep := rep || public._sp_chk('anon: เรียกตัวอย่างไม่ได้', public._sp_err(format('select public.preview_trip_share(%L)', v_trip)) = '42501') || E'\n';
  perform public._sp_as(v_b);
  rep := rep || public._sp_chk('คนอื่น: ดูตัวอย่างทริปที่ไม่ใช่ของตัวเองไม่ได้', public._sp_err(format('select public.preview_trip_share(%L)', v_trip)) = '42501') || E'\n';
  perform public._sp_as(v_e);
  rep := rep || public._sp_chk('Editor ของทริป: ดูตัวอย่างไม่ได้ (เฉพาะเจ้าของ)', public._sp_err(format('select public.preview_trip_share(%L)', v_trip)) = '42501') || E'\n';
  perform public._sp_as(v_adm);
  rep := rep || public._sp_chk('Admin: ดูตัวอย่างของทริปคนอื่นไม่ได้', public._sp_err(format('select public.preview_trip_share(%L)', v_trip)) = '42501') || E'\n';
  perform public._sp_as(v_a);
  rep := rep || public._sp_chk('เจ้าของ: ทริปที่ไม่มีอยู่จริง / trip เป็น NULL → ปฏิเสธ',
    public._sp_err(format('select public.preview_trip_share(%L)', gen_random_uuid())) = '42501' and public._sp_err('select public.preview_trip_share(null)') = '42501') || E'\n';
  perform public._sp_as(v_a);
  rep := rep || public._sp_chk('เจ้าของ: ใช้ทริปของคนอื่นไม่ได้', public._sp_err(format('select public.preview_trip_share(%L)', v_trip_other)) = '42501') || E'\n';

  -- ===== 2) ไม่ทิ้งร่องรอย =====
  reset role;
  select count(*) into n_before from public.trip_shares;
  select updated_at into updated_before from public.trips where id = v_trip;
  perform public._sp_as(v_a);
  pv1 := public.preview_trip_share(v_trip, 'ทริปสาธารณะ');
  reset role;
  select count(*) into n_after from public.trip_shares;
  select updated_at into updated_after from public.trips where id = v_trip;
  rep := rep || public._sp_chk('เจ้าของ: ได้ตัวอย่างเป็น JSON', pv1 is not null and jsonb_typeof(pv1) = 'object' and pv1->>'title' = 'ทริปสาธารณะ') || E'\n';
  rep := rep || public._sp_chk('ตัวอย่างไม่ทิ้งแถวใน trip_shares', n_before = 0 and n_after = 0) || E'\n';
  rep := rep || public._sp_chk('ตัวอย่างไม่แก้ข้อมูลทริป (updated_at เท่าเดิม)', updated_before = updated_after) || E'\n';

  perform public._sp_as(v_a);
  ok_all := true;
  for i in 1..8 loop
    ok_all := ok_all and public.preview_trip_share(v_trip, 'ทริปสาธารณะ') is not null;
  end loop;
  reset role;
  rep := rep || public._sp_chk('เรียกตัวอย่าง 8 ครั้งติดกัน ไม่กินโควตา 5 ลิงก์ และไม่เหลือแถว', ok_all and (select count(*) from public.trip_shares) = 0) || E'\n';

  -- การตรวจค่าที่ผิดต้องไม่ทิ้งแถวเช่นกัน
  perform public._sp_as(v_a);
  rep := rep || public._sp_chk('ข้อความเกิน 280 ตัวอักษร → 22023 (เหมือนตอนสร้างลิงก์)', public._sp_err(format('select public.preview_trip_share(%L, null, null, %L)', v_trip, repeat('ก', 281))) = '22023') || E'\n';
  rep := rep || public._sp_chk('อายุลิงก์ 0 / 366 วัน → 22023', public._sp_err(format('select public.preview_trip_share(%L, null, null, null, 0)', v_trip)) = '22023'
    and public._sp_err(format('select public.preview_trip_share(%L, null, null, null, 366)', v_trip)) = '22023') || E'\n';
  reset role;
  rep := rep || public._sp_chk('ตัวอย่างที่ error ก็ไม่ทิ้งแถว', (select count(*) from public.trip_shares) = 0) || E'\n';

  -- ===== 3) ตัวอย่าง = ของจริง (ต้องเหมือนกันทุกตัวอักษร ยกเว้นเวลาหมดอายุ) =====
  perform public._sp_as(v_a);
  pv1 := public.preview_trip_share(v_trip, 'ทริปสาธารณะ');
  pv2 := public.preview_trip_share(v_trip, 'ทริปเต็ม', 'ผู้แชร์ทดสอบ', 'ข้อความถึงผู้ดู', 7, true, true, true);
  pv3 := public.preview_trip_share(v_trip, 'ซ่อนวัน', null, null, null, false, false, false);
  select * into s1 from public.create_trip_share(v_trip, 'ทริปสาธารณะ');
  select * into s2 from public.create_trip_share(v_trip, 'ทริปเต็ม', 'ผู้แชร์ทดสอบ', 'ข้อความถึงผู้ดู', 7, true, true, true);
  select * into s3 from public.create_trip_share(v_trip, 'ซ่อนวัน', null, null, null, false, false, false);
  perform public._sp_anon();
  rl1 := public.get_shared_trip(s1.token); rl2 := public.get_shared_trip(s2.token); rl3 := public.get_shared_trip(s3.token);
  rep := rep || public._sp_chk('ตัวอย่าง = ผู้ดูจริง (ค่าเริ่มต้น)', (pv1 - 'expires_at') = (rl1 - 'expires_at') and rl1 is not null) || E'\n';
  rep := rep || public._sp_chk('ตัวอย่าง = ผู้ดูจริง (เปิดชื่อที่พัก + ชื่อที่พิมพ์เอง + ผู้แชร์ + ข้อความ)', (pv2 - 'expires_at') = (rl2 - 'expires_at') and rl2 is not null) || E'\n';
  rep := rep || public._sp_chk('ตัวอย่าง = ผู้ดูจริง (ซ่อนวันที่, ไม่หมดอายุ)', (pv3 - 'expires_at') = (rl3 - 'expires_at') and rl3 is not null) || E'\n';
  rep := rep || public._sp_chk('เวลาหมดอายุในตัวอย่างสมเหตุสมผล (ค่าเริ่มต้น ~30 วัน / 7 วัน / ไม่หมดอายุ)',
    (pv1->>'expires_at')::timestamptz between now() + interval '29 days' and now() + interval '31 days'
    and (pv2->>'expires_at')::timestamptz between now() + interval '6 days' and now() + interval '8 days'
    and pv3->>'expires_at' is null) || E'\n';
  rep := rep || public._sp_chk('ตัวอย่างไม่มี token ของลิงก์ และไม่มี id ของแถวชั่วคราวหลุดออกมา',
    public._sp_leaks(pv1, array[s1.token::text, s2.token::text, s3.token::text, s1.id::text]) = '' and not (pv1 ? 'token') and not (pv1 ? 'id')) || E'\n';

  -- ===== 4) ไม่รั่ว =====
  rep := rep || public._sp_chk('ตัวอย่าง (ค่าเริ่มต้น) ไม่มี SECRET / ตัวเลขงบ / พิกัดบ้านหรือพิกัดส่วนตัว [' || public._sp_leaks(pv1, hide_default) || ']', public._sp_leaks(pv1, hide_default) = '') || E'\n';
  rep := rep || public._sp_chk('ตัวอย่าง (เปิดตัวเลือกทั้งหมด) ไม่รั่ว เว้นแต่ชื่อที่พัก/ชื่อกิจกรรมที่เปิดให้เอง [' || public._sp_leaks(pv2, hide_opened) || ']', public._sp_leaks(pv2, hide_opened) = '') || E'\n';
  rep := rep || public._sp_chk('ตัวอย่างที่ซ่อนวันที่: ไม่มีวันที่ใด ๆ', position('2030' in pv3::text) = 0) || E'\n';
  rep := rep || public._sp_chk('ตัวอย่างไม่ได้ส่งชื่อทริปจริง ถ้าตั้งชื่อที่แสดงไว้', position('SECRET_TRIPNAME' in pv1::text) = 0) || E'\n';

  -- ===== 5) ตัวอย่างเมื่อมีลิงก์ครบ 5 ลิงก์ =====
  perform public._sp_as(v_a);
  perform public.create_trip_share(v_trip, 'ลิงก์ 4');
  perform public.create_trip_share(v_trip, 'ลิงก์ 5');
  rep := rep || public._sp_chk('มีลิงก์ใช้งานครบ 5 → ตัวอย่างขึ้น 54000 (ต้องปิดลิงก์เก่าก่อน เหมือนการสร้างลิงก์)', public._sp_err(format('select public.preview_trip_share(%L)', v_trip)) = '54000') || E'\n';
  perform public.revoke_trip_share(s1.id);
  rep := rep || public._sp_chk('ปิดลิงก์ 1 อัน → ดูตัวอย่างได้อีก', public.preview_trip_share(v_trip, 'ทริปสาธารณะ') is not null) || E'\n';

  -- ===== 6) ล้างตัวอักษรควบคุมเหมือนตอนสร้างลิงก์ =====
  pv1 := public.preview_trip_share(v_trip, 'ชื่อ' || chr(7) || 'ทดสอบ', 'ผู้แชร์' || chr(9), 'บรรทัด1' || chr(10) || 'บรรทัด2' || chr(7), 30);
  rep := rep || public._sp_chk('ตัวอักษรควบคุมถูกล้าง ภาษาไทยและบรรทัดใหม่ในข้อความยังอยู่',
    pv1->>'title' = 'ชื่อ ทดสอบ' and pv1->>'sharer' = 'ผู้แชร์' and pv1->>'message' = E'บรรทัด1\nบรรทัด2') || E'\n';

  -- ===== 7) การตั้งค่า =====
  reset role;
  rep := rep || public._sp_chk('preview_trip_share เป็น SECURITY DEFINER และตั้ง search_path',
    (select prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path%' from pg_proc where oid = 'public.preview_trip_share(uuid,text,text,text,integer,boolean,boolean,boolean)'::regprocedure)) || E'\n';
  rep := rep || public._sp_chk('anon เรียก preview ไม่ได้, authenticated เรียกได้',
    not has_function_privilege('anon', 'public.preview_trip_share(uuid,text,text,text,integer,boolean,boolean,boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.preview_trip_share(uuid,text,text,text,integer,boolean,boolean,boolean)', 'execute')) || E'\n';
  rep := rep || public._sp_chk('ฟังก์ชันของ 009 ยังสิทธิ์เดิม (anon เรียก get_shared_trip ได้, เรียก create ไม่ได้)',
    has_function_privilege('anon', 'public.get_shared_trip(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.create_trip_share(uuid,text,text,text,integer,boolean,boolean,boolean)', 'execute')) || E'\n';
  rep := rep || public._sp_chk('trip_shares: authenticated ยังเขียนตรง ๆ ไม่ได้ และ anon ยังไม่เห็นอะไร',
    not has_table_privilege('authenticated', 'public.trip_shares', 'insert') and not has_table_privilege('anon', 'public.trip_shares', 'select')) || E'\n';

  select count(*), count(*) filter (where l like 'PASS%') into total, passed
    from unnest(string_to_array(rep, E'\n')) l where l <> '';

  raise exception E'\n================ SHARE PREVIEW TEST REPORT ================\n%\n===========================================================\n%',
    rep,
    case when passed = total
      then format('ALL PASSED %s/%s  (ข้อมูลทดสอบถูก rollback แล้ว — ไม่เหลือในฐานข้อมูล)', passed, total)
      else format('FAILED %s จาก %s ข้อ — ดูบรรทัดที่ขึ้นต้นด้วย FAIL', total - passed, total) end;
end
$s$;
