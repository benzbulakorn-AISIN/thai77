-- =====================================================================
-- เที่ยวไทย 77 จังหวัด — RLS Security Test
--
-- วิธีใช้: Supabase → SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
--
-- ผลลัพธ์จะขึ้นเป็น "ERROR" สีแดง — เป็นเรื่องปกติและตั้งใจไว้ครับ
--   เพราะสคริปต์ปิดท้ายด้วยการ raise exception เพื่อ ROLLBACK ทุกอย่าง
--   (ผู้ใช้ทดสอบ ทริป ข้อมูลทดสอบ จะไม่เหลืออยู่ในฐานข้อมูลจริง)
--   ให้อ่านรายงานในข้อความ error: PASS = ถูกต้อง, FAIL = มีช่องโหว่/ผิดพลาด
--   ท้ายรายงานต้องขึ้น "ALL PASSED"
--
-- ต้องรัน migrations 001–007, seed.sql และ seed_geo.sql (หรืออย่างน้อยมี 1 จังหวัด) ก่อน
-- =====================================================================

-- ---------- helpers (อยู่ใน transaction เดียวกัน จึงถูก rollback ด้วย) ----------
create function public._rls_chk(n text, ok boolean) returns text language sql immutable as $$
  select (case when coalesce(ok, false) then 'PASS  ' else 'FAIL  ' end) || n
$$;

-- count of rows visible to the CURRENT role (-1 = error, e.g. permission denied)
create function public._rls_count(q text) returns int language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  return n;
exception when others then return -1;
end $$;

-- rows affected by a statement run as the CURRENT role (-1 = error / denied by RLS check)
create function public._rls_dml(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
exception when others then return -1;
end $$;

create function public._rls_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;
end $$;

create function public._rls_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;

grant execute on function public._rls_chk(text, boolean), public._rls_count(text), public._rls_dml(text),
  public._rls_as(uuid), public._rls_anon() to anon, authenticated;

-- ---------- the tests ----------
do $rls$
declare
  a uuid := gen_random_uuid();     -- ผู้ใช้ A (เจ้าของทริป)
  b uuid := gen_random_uuid();     -- ผู้ใช้ B (คนอื่น / ถูกชวนภายหลัง)
  adm uuid := gen_random_uuid();   -- Admin
  prov uuid; cat uuid; bcat uuid;
  pub uuid; unpub uuid; t1 uuid; up uuid; v1 uuid; v2 uuid;
  n int; rep text := ''; total int; passed int; pf_path text;
begin
  select id into prov from public.provinces limit 1;
  select id into cat from public.categories limit 1;
  select id into bcat from public.budget_categories limit 1;
  if prov is null or cat is null or bcat is null then
    raise exception 'ยังไม่มีข้อมูลอ้างอิง — รัน seed.sql และ seed_geo.sql ก่อน';
  end if;
  if to_regprocedure('public.admin_list_submissions()') is null then
    raise exception 'ยังไม่ได้รัน Migration 007 (admin_review)';
  end if;

  -- ===== เตรียมข้อมูล (ทำด้วยสิทธิ์เจ้าของฐานข้อมูล) =====
  insert into auth.users (id, email, aud, role) values
    (a,   'rls-a@example.invalid',   'authenticated', 'authenticated'),
    (b,   'rls-b@example.invalid',   'authenticated', 'authenticated'),
    (adm, 'rls-adm@example.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = adm;
  insert into public.places (name_th, province_id, category_id, is_published) values ('RLS published', prov, cat, true) returning id into pub;
  insert into public.places (name_th, province_id, category_id, is_published) values ('RLS unpublished', prov, cat, false) returning id into unpub;

  -- ===== A สร้างข้อมูลของตัวเอง =====
  perform public._rls_as(a);
  insert into public.trips (owner_id, name, start_date, end_date) values (a, 'A trip', '2030-01-01', '2030-01-02') returning id into t1;
  insert into public.trip_days (trip_id, day_index) values (t1, 1);
  insert into public.budget_items (trip_id, category_id, label) values (t1, bcat, 'น้ำมัน');
  insert into public.user_places (owner_id, name_th, notes) values (a, 'ร้านลับของ A', 'secret note') returning id into up;
  insert into public.visited_places (user_id, place_name, visited_on, trip_id, share_with_trip) values (a, 'private visit', current_date, t1, false) returning id into v1;
  insert into public.visited_places (user_id, place_name, visited_on, trip_id, share_with_trip) values (a, 'shared visit', current_date, t1, true) returning id into v2;
  insert into public.user_place_status (user_id, place_id, status) values (a, pub, 'want');
  insert into public.favorites (user_id, place_id) values (a, pub);

  -- ===== 1) ผู้เยี่ยมชม (anon) =====
  perform public._rls_anon();
  rep := rep || public._rls_chk('anon: อ่านจังหวัดได้', public._rls_count('select 1 from public.provinces') > 0) || E'\n';
  rep := rep || public._rls_chk('anon: อ่านหมวดหมู่ได้', public._rls_count('select 1 from public.categories') > 0) || E'\n';
  rep := rep || public._rls_chk('anon: เห็นสถานที่ที่เผยแพร่', public._rls_count(format('select 1 from public.places where id = %L', pub)) = 1) || E'\n';
  rep := rep || public._rls_chk('anon: ไม่เห็นสถานที่ที่ปิดการแสดง', public._rls_count(format('select 1 from public.places where id = %L', unpub)) = 0) || E'\n';
  rep := rep || public._rls_chk('anon: อ่านทริปไม่ได้', public._rls_count('select 1 from public.trips') <= 0) || E'\n';
  rep := rep || public._rls_chk('anon: อ่านโปรไฟล์ไม่ได้', public._rls_count('select 1 from public.profiles') <= 0) || E'\n';
  rep := rep || public._rls_chk('anon: อ่านความทรงจำไม่ได้', public._rls_count('select 1 from public.visited_places') <= 0) || E'\n';
  rep := rep || public._rls_chk('anon: สร้างทริปไม่ได้',
    public._rls_dml(format('insert into public.trips (owner_id, name, start_date, end_date) values (%L, %L, %L, %L)', a, 'x', '2030-01-01', '2030-01-02')) <= 0) || E'\n';
  rep := rep || public._rls_chk('anon: เพิ่มสถานที่ส่วนกลางไม่ได้',
    public._rls_dml(format('insert into public.places (name_th, province_id, category_id) values (%L, %L, %L)', 'x', prov, cat)) <= 0) || E'\n';

  -- ===== 2) A (ผู้ใช้ทั่วไป) =====
  perform public._rls_as(a);
  rep := rep || public._rls_chk('A: เห็นทริปของตัวเอง', public._rls_count(format('select 1 from public.trips where id = %L', t1)) = 1) || E'\n';
  rep := rep || public._rls_chk('A: ถูกบันทึกเป็น owner ของทริปอัตโนมัติ',
    public._rls_count(format('select 1 from public.trip_members where trip_id = %L and user_id = %L and role = ''owner''', t1, a)) = 1) || E'\n';
  rep := rep || public._rls_chk('A: เลื่อนตัวเองเป็น admin ไม่ได้', public._rls_dml(format('update public.profiles set role = ''admin'' where id = %L', a)) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: แก้ชื่อที่แสดงของตัวเองได้', public._rls_dml(format('update public.profiles set display_name = ''A name'' where id = %L', a)) = 1) || E'\n';
  rep := rep || public._rls_chk('A: แก้โปรไฟล์ของ B ไม่ได้', public._rls_dml(format('update public.profiles set display_name = ''hacked'' where id = %L', b)) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: สร้างทริปในชื่อ B ไม่ได้',
    public._rls_dml(format('insert into public.trips (owner_id, name, start_date, end_date) values (%L, %L, %L, %L)', b, 'x', '2030-01-01', '2030-01-02')) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: เพิ่มสถานที่ส่วนกลางไม่ได้',
    public._rls_dml(format('insert into public.places (name_th, province_id, category_id) values (%L, %L, %L)', 'x', prov, cat)) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: แก้สถานที่ส่วนกลางไม่ได้', public._rls_dml(format('update public.places set name_th = ''hacked'' where id = %L', pub)) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: ลบสถานที่ส่วนกลางไม่ได้', public._rls_dml(format('delete from public.places where id = %L', pub)) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: แก้หมวดหมู่ไม่ได้', public._rls_dml('update public.categories set name_th = ''hacked''') <= 0) || E'\n';
  rep := rep || public._rls_chk('A: ไม่เห็นสถานที่ที่ปิดการแสดง', public._rls_count(format('select 1 from public.places where id = %L', unpub)) = 0) || E'\n';
  rep := rep || public._rls_chk('A: เห็นสถานที่ที่เผยแพร่', public._rls_count(format('select 1 from public.places where id = %L', pub)) = 1) || E'\n';

  -- ===== 3) B (คนอื่น ยังไม่ถูกชวน) =====
  perform public._rls_as(b);
  rep := rep || public._rls_chk('B: ไม่เห็นทริปของ A', public._rls_count(format('select 1 from public.trips where id = %L', t1)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: ไม่เห็นวันในทริปของ A', public._rls_count(format('select 1 from public.trip_days where trip_id = %L', t1)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: ไม่เห็นงบของ A', public._rls_count(format('select 1 from public.budget_items where trip_id = %L', t1)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: แก้ทริปของ A ไม่ได้', public._rls_dml(format('update public.trips set name = ''hacked'' where id = %L', t1)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B: ลบทริปของ A ไม่ได้', public._rls_dml(format('delete from public.trips where id = %L', t1)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B: เพิ่มวันในทริปของ A ไม่ได้', public._rls_dml(format('insert into public.trip_days (trip_id, day_index) values (%L, 9)', t1)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B: เพิ่มงบในทริปของ A ไม่ได้',
    public._rls_dml(format('insert into public.budget_items (trip_id, category_id, label) values (%L, %L, ''x'')', t1, bcat)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B: ไม่เห็นความทรงจำของ A', public._rls_count(format('select 1 from public.visited_places where user_id = %L', a)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: บันทึกความทรงจำในชื่อ A ไม่ได้',
    public._rls_dml(format('insert into public.visited_places (user_id, place_name, visited_on) values (%L, ''x'', current_date)', a)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B: ไม่เห็นสถานที่ส่วนตัวของ A (และบันทึกลับ)', public._rls_count(format('select 1 from public.user_places where owner_id = %L', a)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: ไม่เห็นสถานะสถานที่ของ A', public._rls_count(format('select 1 from public.user_place_status where user_id = %L', a)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: ไม่เห็นรายการโปรดของ A', public._rls_count(format('select 1 from public.favorites where user_id = %L', a)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: อ่านโปรไฟล์ของ A ไม่ได้ (ยังไม่ใช่สมาชิกทริปเดียวกัน)', public._rls_count(format('select 1 from public.profiles where id = %L', a)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: ชวนคนเข้าทริปของ A ไม่ได้', public._rls_dml(format('select public.invite_trip_member(%L, %L)', t1, 'rls-b@example.invalid')) <= 0) || E'\n';
  rep := rep || public._rls_chk('B: เรียกฟังก์ชันตรวจสถานที่ของ Admin ไม่ได้', public._rls_dml('select * from public.admin_list_submissions()') <= 0) || E'\n';
  rep := rep || public._rls_chk('B: อนุมัติสถานที่ที่ผู้ใช้เสนอไม่ได้', public._rls_dml(format('select public.admin_decide_submission(%L, ''approved'', null)', up)) <= 0) || E'\n';

  -- ===== 4) A ชวน B เป็น editor =====
  perform public._rls_as(a);
  rep := rep || public._rls_chk('A: ชวน B เข้าทริปได้', public._rls_dml(format('select public.invite_trip_member(%L, %L)', t1, 'rls-b@example.invalid')) = 1) || E'\n';
  rep := rep || public._rls_chk('A: ชวนคนที่ไม่มีบัญชีไม่ได้', public._rls_dml(format('select public.invite_trip_member(%L, %L)', t1, 'nobody@example.invalid')) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: ตั้งใครเป็น owner ผ่านการชวนไม่ได้', public._rls_dml(format('select public.invite_trip_member(%L, %L, ''owner'')', t1, 'rls-b@example.invalid')) <= 0) || E'\n';

  -- ===== 5) B (editor ของทริป) =====
  perform public._rls_as(b);
  rep := rep || public._rls_chk('B(editor): เห็นทริป', public._rls_count(format('select 1 from public.trips where id = %L', t1)) = 1) || E'\n';
  rep := rep || public._rls_chk('B(editor): เห็นวันและงบของทริป',
    public._rls_count(format('select 1 from public.trip_days where trip_id = %L', t1)) = 1
    and public._rls_count(format('select 1 from public.budget_items where trip_id = %L', t1)) = 1) || E'\n';
  rep := rep || public._rls_chk('B(editor): แก้ชื่อทริปได้', public._rls_dml(format('update public.trips set name = ''B renamed'' where id = %L', t1)) = 1) || E'\n';
  rep := rep || public._rls_chk('B(editor): เพิ่มวันได้', public._rls_dml(format('insert into public.trip_days (trip_id, day_index) values (%L, 2)', t1)) = 1) || E'\n';
  rep := rep || public._rls_chk('B(editor): เพิ่มงบได้',
    public._rls_dml(format('insert into public.budget_items (trip_id, category_id, label) values (%L, %L, ''อาหาร'')', t1, bcat)) = 1) || E'\n';
  rep := rep || public._rls_chk('B(editor): ลบทริปไม่ได้', public._rls_dml(format('delete from public.trips where id = %L', t1)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B(editor): เปลี่ยนเจ้าของทริปไม่ได้', public._rls_dml(format('update public.trips set owner_id = %L where id = %L', b, t1)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B(editor): ชวนคนอื่นไม่ได้ (เฉพาะ owner)', public._rls_dml(format('select public.invite_trip_member(%L, %L)', t1, 'rls-adm@example.invalid')) <= 0) || E'\n';
  rep := rep || public._rls_chk('B(editor): ถอด A ออกจากทริปไม่ได้', public._rls_dml(format('delete from public.trip_members where trip_id = %L and user_id = %L', t1, a)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B(editor): เลื่อนตัวเองเป็น owner ไม่ได้',
    public._rls_dml(format('update public.trip_members set role = ''owner'' where trip_id = %L and user_id = %L', t1, b)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B(สมาชิก): อ่านโปรไฟล์ A ได้', public._rls_count(format('select 1 from public.profiles where id = %L', a)) = 1) || E'\n';
  rep := rep || public._rls_chk('B(สมาชิก): เห็นความทรงจำที่ A เปิดแชร์ให้ทริป', public._rls_count(format('select 1 from public.visited_places where id = %L', v2)) = 1) || E'\n';
  rep := rep || public._rls_chk('B(สมาชิก): ไม่เห็นความทรงจำที่ A ไม่ได้แชร์', public._rls_count(format('select 1 from public.visited_places where id = %L', v1)) = 0) || E'\n';
  rep := rep || public._rls_chk('B(สมาชิก): ยังไม่เห็นสถานที่ส่วนตัวของ A', public._rls_count(format('select 1 from public.user_places where owner_id = %L', a)) = 0) || E'\n';
  rep := rep || public._rls_chk('B(สมาชิก): ออกจากทริปเองได้', public._rls_dml(format('delete from public.trip_members where trip_id = %L and user_id = %L', t1, b)) = 1) || E'\n';
  rep := rep || public._rls_chk('B: หลังออกจากทริป ไม่เห็นทริปอีก', public._rls_count(format('select 1 from public.trips where id = %L', t1)) = 0) || E'\n';

  -- ===== 6) การเสนอสถานที่ + Admin =====
  perform public._rls_as(a);
  rep := rep || public._rls_chk('A: เสนอสถานที่ส่วนตัวให้ Admin ได้', public._rls_dml(format('update public.user_places set submission = ''submitted'' where id = %L', up)) = 1) || E'\n';

  perform public._rls_as(adm);
  rep := rep || public._rls_chk('Admin: อ่านตาราง user_places ตรง ๆ ไม่ได้ (ป้องกันบันทึกลับ)', public._rls_count(format('select 1 from public.user_places where id = %L', up)) = 0) || E'\n';
  rep := rep || public._rls_chk('Admin: เห็นรายการเสนอผ่านฟังก์ชัน', public._rls_count(format('select 1 from public.admin_list_submissions() where id = %L', up)) = 1) || E'\n';
  rep := rep || public._rls_chk('Admin: ไม่เห็นทริปของ A', public._rls_count(format('select 1 from public.trips where id = %L', t1)) = 0) || E'\n';
  rep := rep || public._rls_chk('Admin: ไม่เห็นความทรงจำของ A', public._rls_count(format('select 1 from public.visited_places where id in (%L, %L)', v1, v2)) = 0) || E'\n';
  rep := rep || public._rls_chk('Admin: เพิ่มสถานที่ส่วนกลางได้', public._rls_dml(format('insert into public.places (name_th, province_id, category_id) values (%L, %L, %L)', 'admin place', prov, cat)) = 1) || E'\n';
  rep := rep || public._rls_chk('Admin: เห็นสถานที่ที่ปิดการแสดง', public._rls_count(format('select 1 from public.places where id = %L', unpub)) = 1) || E'\n';
  rep := rep || public._rls_chk('Admin: แก้หมวดหมู่ได้', public._rls_dml('update public.categories set name_th = name_th') >= 1) || E'\n';
  rep := rep || public._rls_chk('Admin: อ่านโปรไฟล์ทุกคนได้', public._rls_count('select 1 from public.profiles') >= 3) || E'\n';
  rep := rep || public._rls_chk('Admin: อนุมัติรายการที่เสนอได้', public._rls_dml(format('select public.admin_decide_submission(%L, ''approved'', %L)', up, pub)) = 1) || E'\n';

  perform public._rls_as(a);
  rep := rep || public._rls_chk('A: เห็นสถานะ approved ของสถานที่ที่เสนอ', public._rls_count(format('select 1 from public.user_places where id = %L and submission = ''approved''', up)) = 1) || E'\n';

  -- ===== 7) Storage =====
  pf_path := a::text || '/' || v1::text || '/t.webp';
  perform public._rls_as(a);
  rep := rep || public._rls_chk('A: อัปโหลดรูปเข้าโฟลเดอร์ของตัวเองได้',
    public._rls_dml(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'memory-photos', pf_path, a::text)) = 1) || E'\n';
  rep := rep || public._rls_chk('A: เห็นรูปของตัวเอง', public._rls_count(format('select 1 from storage.objects where name = %L', pf_path)) = 1) || E'\n';
  rep := rep || public._rls_chk('A: อัปโหลดเข้าโฟลเดอร์ของ B ไม่ได้',
    public._rls_dml(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'memory-photos', b::text || '/x.webp', a::text)) <= 0) || E'\n';
  rep := rep || public._rls_chk('A: อัปโหลดรูปสถานที่ส่วนกลาง (place-images) ไม่ได้',
    public._rls_dml(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'place-images', 'x/a.webp', a::text)) <= 0) || E'\n';

  perform public._rls_as(b);
  rep := rep || public._rls_chk('B: ไม่เห็นรูปของ A', public._rls_count(format('select 1 from storage.objects where name = %L', pf_path)) = 0) || E'\n';
  rep := rep || public._rls_chk('B: อัปโหลดเข้าโฟลเดอร์ของ A ไม่ได้',
    public._rls_dml(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'memory-photos', a::text || '/y.webp', b::text)) <= 0) || E'\n';
  rep := rep || public._rls_chk('B: ลบรูปของ A ไม่ได้', public._rls_dml(format('delete from storage.objects where name = %L', pf_path)) <= 0) || E'\n';

  perform public._rls_anon();
  rep := rep || public._rls_chk('anon: ไม่เห็นรูปส่วนตัว', public._rls_count('select 1 from storage.objects where bucket_id = ''memory-photos''') <= 0) || E'\n';

  perform public._rls_as(adm);
  rep := rep || public._rls_chk('Admin: ไม่เห็นรูปส่วนตัวของ A', public._rls_count(format('select 1 from storage.objects where name = %L', pf_path)) = 0) || E'\n';
  rep := rep || public._rls_chk('Admin: อัปโหลดรูปสถานที่ส่วนกลางได้',
    public._rls_dml(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'place-images', 'x/admin.webp', adm::text)) = 1) || E'\n';

  -- ===== 8) การตั้งค่าระบบ (ตรวจด้วยสิทธิ์เจ้าของฐานข้อมูล) =====
  reset role;
  rep := rep || public._rls_chk('ทุกตารางใน public เปิด RLS', (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0) || E'\n';
  rep := rep || public._rls_chk('bucket memory-photos เป็น private', (select not public from storage.buckets where id = 'memory-photos')) || E'\n';
  rep := rep || public._rls_chk('bucket trip-covers เป็น private', (select not public from storage.buckets where id = 'trip-covers')) || E'\n';
  rep := rep || public._rls_chk('role ของ A ยังเป็น user', (select role::text from public.profiles where id = a) = 'user') || E'\n';
  rep := rep || public._rls_chk('สมัครสมาชิกแล้วสร้างโปรไฟล์และการตั้งค่าอัตโนมัติ',
    (select count(*) from public.profiles where id in (a, b, adm)) = 3 and (select count(*) from public.user_settings where user_id in (a, b, adm)) = 3) || E'\n';
  rep := rep || public._rls_chk('ฟังก์ชันตรวจสถานที่ไม่ส่งคอลัมน์ notes (บันทึกลับ) ออกมา',
    not exists (select 1 from pg_proc where proname = 'admin_list_submissions' and 'notes' = any (proargnames))) || E'\n';
  rep := rep || public._rls_chk('anon เรียก invite_trip_member ไม่ได้', not has_function_privilege('anon', 'public.invite_trip_member(uuid,text,public.trip_member_role)', 'execute')) || E'\n';
  rep := rep || public._rls_chk('anon เรียกฟังก์ชัน Admin ไม่ได้',
    not has_function_privilege('anon', 'public.admin_list_submissions()', 'execute')
    and not has_function_privilege('anon', 'public.admin_decide_submission(uuid,public.submission_status,uuid)', 'execute')) || E'\n';
  rep := rep || public._rls_chk('authenticated อ่านตาราง auth.users โดยตรงไม่ได้', not has_table_privilege('authenticated', 'auth.users', 'select')) || E'\n';

  -- ===== สรุป =====
  select count(*), count(*) filter (where l like 'PASS%') into total, passed
    from unnest(string_to_array(rep, E'\n')) l where l <> '';

  raise exception E'\n================ RLS TEST REPORT ================\n%\n=================================================\n%',
    rep,
    case when passed = total
      then format('ALL PASSED %s/%s  (ข้อมูลทดสอบถูก rollback แล้ว — ไม่เหลือในฐานข้อมูล)', passed, total)
      else format('FAILED %s จาก %s ข้อ — ดูบรรทัดที่ขึ้นต้นด้วย FAIL', total - passed, total) end;
end
$rls$;
